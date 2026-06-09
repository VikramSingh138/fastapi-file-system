import os
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt

# Tells fastapi to look for the "authorization : bearer <token>" header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login/traditional")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_secret_key_for_safety")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

async def get_current_user_metadata(token : str = Depends(oauth2_scheme)) -> dict :

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate active session credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try :
        payload = jwt.decode(token ,SECRET_KEY, algorithms=[ALGORITHM])

        email : str = payload.get("sub")
        role: str = payload.get("role")

        if email is None or role is None :
            raise credentials_exception
        
        # return identity props as a dict
        return {"email": email , "role": role}
    
    except jwt.PyJWTError:
        raise credentials_exception
    
class RoleChecker:
    """
    A reusable class dependency that enforces granular Role-Based Access Control.
    """
    def __init__(self, allowed_roles: list[str]):
        # Store the list of roles permitted to access an endpoint (e.g., ["admin"])
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: dict = Depends(get_current_user_metadata)):
        # Check if the user's role exists inside our allowed list
        if current_user["role"] not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You do not possess adequate security clearance permissions."
            )
        # If authorized, pass the user data cleanly along to the route function
        return current_user
    