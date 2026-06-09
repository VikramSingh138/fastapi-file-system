import os
import io
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
import bcrypt
import jwt
import httpx
from fastapi.responses import RedirectResponse
# async HTTP client to req to send backend requests to googles api server

router = APIRouter(prefix= "/auth", tags=["Authentication"]) # every path in this file withh pass throught this route /auth/ then xyz

# setting up password hashing

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login/traditional") 

# FETCH JWT CONFIG FROM ENV

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_secret_key_for_safety")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))

# PYDANTIC SCHEMAS

class UserRegiser(BaseModel):
    email : EmailStr
    password : str
    full_name : str
    role: Optional[str] = "user" # default user not admin
    

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

# Helper to hash and verify pwd

def hash_password(password: str) -> str:
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# TRADITIONAL REGISTRATION ENDPOINT

@router.post("/register")
async def register_user(user: UserRegiser, request: Request):
    db = request.app.state.database

    # check if email already exists in db so no new register

    existing_user = await db["users"].find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code = 400, detail="Email already registered")

    # Enforce role settings 
    assigned_role = user.role if user.role in ["admin", "user"] else "user"

    # creating the mongodb record for the new user and storing the hashed password only
    user_document = {
        "email" : user.email,
        "hashed_password" : hash_password(user.password),
        "full_name": user.full_name,
        "role": assigned_role
    }

    await db["users"].insert_one(user_document)
    return {"message" : f"User {user.email} registered succesfully with role {assigned_role}"}


# TRADITIONAL LOGIN ENDPOINT

@router.post("/login/traditional", response_model = TokenResponse)
async def login_traditional(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    db = request.app.state.database

    # find user in Mongodb 

    user = await db["users"].find_one({"email" : form_data.username})
    if not user or not verify_password(form_data.password, user.get("hashed_password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid email or password credentials."
        )
    
    # Create unified JWT access Token containing identity and role params
    # JWT token works for 60 mins after that expires and makes the user login persistent 
    token = create_access_token({"sub" : user["email"], "role": user["role"]})
    return {"access_token" : token ,"token_type": "bearer"}

# OAUTH2 GOOGLE CALLBACK ENDPOINT

@router.get("/oauth2/google/callback")
async def google_callback(code : str , request: Request):
    db = request.app.state.database

    # EXCHANGE VERIFICATION AUTH CODE FOR OFFICIAL GOOGLE ACCESS TOKEN

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                "redirect_uri": os.getenv("GOOGLE_REDIRECT_URI"),
                "grant_type": "authorization_code",
            }
        )

        # gets the user creds from google 
        token_data = token_response.json()

        # if unauth access tries then this is called 
        if "access_token" not in token_data:
            raise HTTPException(status_code=400, detail="Google authentication verification handshake failed.")
        
        # req authenticated user's profile info from google apis
        profile_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"}
        )

        profile = profile_response.json()

    email = profile.get("email")

    if not email:
        raise HTTPException(status_code=400, detail="Could not retrieve email identity from Google profile payload.")
    
    # C. Check if user exists in MongoDB. If not, register them on the fly
    user = await db["users"].find_one({"email": email})
    if not user:
        user_document = {
            "email": email,
            "full_name": profile.get("name", "Google User"),
            "role": "user"  # Google OAuth logins default to standard "user" role tier for security
        }
        await db["users"].insert_one(user_document)
        user = user_document

    #. Issue our system's signed secure JWT token matching their internal profile role
    token = create_access_token({"sub": user["email"], "role": user["role"]})


    return RedirectResponse(
        url=f"http://localhost:5173/login?token={token}"
    )
        