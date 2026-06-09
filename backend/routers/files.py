import io
from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from routers.worker import process_file_pipeline
from dependencies.auth_guard import RoleChecker, get_current_user_metadata


router = APIRouter()

# ROLE SPECIFIC GUARD
admin_only_guard = RoleChecker(["admin"])
any_authenticated_user_guard = get_current_user_metadata

class FileMetadata(BaseModel):
    id : str = Field(alias = "_id")
    filename : str
    size_bytes : int
    content_type : str

    class Config:
        populate_by_name = True

@router.post("/upload", dependencies=[Depends(admin_only_guard)])
async def upload_files(request: Request, file : UploadFile = File(...)):
    file_contents = await file.read()
    file_size = len(file_contents)

    minio_client = request.app.state.minio_client
    database = request.app.state.database

    minio_client.put_object(
        bucket_name = "my-files",
        object_name = file.filename,
        data = io.BytesIO(file_contents),
        length = file_size,
        content_type = file.content_type
    )

    metadata = {
        "filename":file.filename,
        "size_bytes": file_size,
        "content_type": file.content_type
    }

    await database["files"].insert_one(metadata)
    
    process_file_pipeline.delay(file.filename)
    print(f"📌 Dispatched task to Redis broker: Ingestion message sent for '{file.filename}'.")

    return {"message": f"Succesfully uploaded {file.filename} ector embedding ingestion started in the background.", "size_bytes":file_size}


@router.get("/files", response_model=list[FileMetadata], dependencies=[Depends(any_authenticated_user_guard)])
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

@router.get("/file/{filename}/download", dependencies=[Depends(any_authenticated_user_guard)])
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
@router.delete("/files/{filename}", dependencies=[Depends(admin_only_guard)])
async def delete_file(request: Request, filename: str):
    minio_client = request.app.state.minio_client
    database = request.app.state.database

    minio_client.remove_object(bucket_name="my-files", object_name=filename)
    delete_result = await database["files"].delete_one({"filename": filename})
    if delete_result.deleted_count == 0:
        return {"message": f"Metadata wasn't found for '{filename}', but cleared any matching storage files."}
    return {"message": f"Successfully deleted '{filename}' from storage and records."}