import os
from fastapi import FastAPI
from contextlib import asynccontextmanager
from motor.motor_asyncio import AsyncIOMotorClient
from minio import Minio
from dotenv import load_dotenv

# Import the router instance from your new file!
from routers.files import router as files_router

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_url = os.getenv("MONGO_URL")
    minio_url = os.getenv("MINIO_URL")
    minio_user = os.getenv("MINIO_USER")
    minio_pass = os.getenv("MINIO_PASSWORD")

    print("Connecting to MongoDB...")
    app.mongodb_client = AsyncIOMotorClient(mongo_url)
    
    # CRITICAL STEP: We save these connections to app.state 
    # so routers/files.py can access them through the Request parameter!
    app.state.database = app.mongodb_client["file_manager_db"] 
    
    print("Connecting to MinIO...")
    app.state.minio_client = Minio(
        minio_url,
        access_key=minio_user,
        secret_key=minio_pass,
        secure=False
    )

    bucket_name = "my-files"
    if not app.state.minio_client.bucket_exists(bucket_name):
        app.state.minio_client.make_bucket(bucket_name)
        print(f"Bucket '{bucket_name}' created successfully")
    else:
        print(f"Bucket '{bucket_name}' already exists")

    yield  # The app runs while paused here

    print("Closing MongoDB connection...")
    app.mongodb_client.close()


app = FastAPI(lifespan=lifespan)

# --- MOUNT THE ROUTER ---
# This links all endpoints inside routers/files.py straight to our app!
app.include_router(files_router)


# Global general routes stay here
@app.get("/")
def read_root():
    return {"message": "Hello World"}

@app.get("/status")
def get_status():
    return {"status": "operational", "version": "1.0.0"}