import io
import os
from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from datetime import datetime , timedelta

from routers.worker import process_file_pipeline
from dependencies.auth_guard import RoleChecker, get_current_user_metadata


router = APIRouter(prefix="/files", tags=["File Engine Workspace"])

# ROLE SPECIFIC GUARD
admin_only_guard = RoleChecker(["admin"])
any_authenticated_user_guard = get_current_user_metadata

# ==========================================
# PYDANTIC DATA VALIDATION MODELS
# ==========================================
class FileMetadata(BaseModel):
    id : str = Field(alias = "_id")
    filename : str
    size_bytes : int
    content_type : str

    class Config:
        populate_by_name = True

class PreSignedUrlRequest(BaseModel):
    filename : str
    content_type : str

class PreSignedUrlResponse(BaseModel):
    upload_url: str
    file_id: str

class UploadCompleteNotification(BaseModel):
    file_id : str
    filename : str
    content_type : str
    size_bytes : int

# ============================
# ENDPOINTS AND ROUTING LOGIC
# ============================

@router.post("/generate-upload-url", response_model=PreSignedUrlResponse, dependencies=[Depends(admin_only_guard)])
async def generate_upload_url(payload : PreSignedUrlRequest, request : Request):

    minio_client= request.app.state.minio_client

    # generate isolated obj namespace key string to prevent namespace collisions
    timestamp_prefix = int(datetime.utcnow().timestamp())
    file_id = f"doc_{timestamp_prefix}_{payload.filename}"

    try :
        # ask minio to generate a signed url durect put pointer vaid for 15 mins
        presigned_url = minio_client.presigned_put_object(
            bucket_name="my-files",
            object_name = file_id,
            expires = timedelta(minutes = 15)
        )

        return PreSignedUrlResponse(upload_url = presigned_url, file_id = file_id)
    
    except Exception as e : 
        raise HTTPException(
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to provision secure storage handshake : {str(e)}"
        )
    
@router.post("/upload-complete", dependencies=[Depends(admin_only_guard)])
async def register_completed_upload(payload: UploadCompleteNotification, request: Request):
    """
    PHASE 2: Callback notification endpoint triggered by the frontend ONLY after 
    it successfully sends the raw binary directly to MinIO.
    """

    database = request.app.state.database

    # metadata record

    metadata_document = {
        "_id": payload.file_id,
        "filename": payload.filename,
        "content_type": payload.content_type,
        "size_bytes": payload.size_bytes,
        "indexed_at": datetime.utcnow()
    }

    # insert metadata in the mongodb 
    await database["files"].insert_one(metadata_document)

    # Fire the background Celery vector embedding pipeline
    process_file_pipeline.delay(payload.file_id)
    print(f"📌 Dispatched task to Redis broker: Ingestion message sent for '{payload.file_id}'.")

    return {"message": "Asset successfully indexed. Background extraction pipeline started."}


@router.get("", response_model=list[FileMetadata], dependencies=[Depends(any_authenticated_user_guard)])
async def list_files(request: Request, content_type: str | None = None):
    database = request.app.state.database
    query = {}
    if content_type:
        query = {"content_type": content_type}

    file_list = []
    cursor = database["files"].find(query)
    async for document in cursor:
        if "_id" in document:
            document["_id"] = str(document["_id"])
        file_list.append(document)
    return file_list

@router.get("/{filename}/download", dependencies=[Depends(any_authenticated_user_guard)])
async def download_file(request: Request, filename: str):
    minio_client = request.app.state.minio_client
    try:
        response = minio_client.get_object(bucket_name="my-files", object_name=filename)
        return StreamingResponse(
            io.BytesIO(response.read()), 
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found.")

# 6. Move the Delete Route here
@router.delete("/{filename}", dependencies=[Depends(admin_only_guard)])
async def delete_file(request: Request, filename: str):
    minio_client = request.app.state.minio_client
    database = request.app.state.database

    minio_client.remove_object(bucket_name="my-files", object_name=filename)

    #Drop accompanying tracking records from MongoDB indices
    # Checks both standard names and isolated file unique ID tracks

    delete_result = await database["files"].delete_one({"filename": filename})
    if delete_result.deleted_count == 0:
        return {"message": f"Metadata wasn't found for '{filename}', but cleared any matching storage files."}
    return {"message": f"Successfully deleted '{filename}' from storage and records."}