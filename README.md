# FastAPI File System

A file management and vector embedding system built with FastAPI. Upload PDF and text files to MinIO object storage, store metadata in MongoDB, and automatically generate semantic vector embeddings via a Celery background worker — stored in Pinecone for future semantic search.

## Features

- Upload PDF and plain-text files to MinIO (S3-compatible object storage)
- Store file metadata in MongoDB
- Download and delete files
- Automatically chunk and embed uploaded files using HuggingFace `all-MiniLM-L6-v2`
- Store vector embeddings in Pinecone via a Celery + Redis background task queue

## Tech Stack

| Layer | Technology |
|---|---|
| API framework | FastAPI + Uvicorn |
| Object storage | MinIO |
| Metadata store | MongoDB (Motor async driver) |
| Task queue | Celery + Redis |
| Embeddings model | HuggingFace `sentence-transformers/all-MiniLM-L6-v2` |
| Vector database | Pinecone |
| Text extraction | PyPDF + LangChain Text Splitters |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Health check |
| GET | `/status` | App status and version |
| POST | `/upload` | Upload a file (triggers background embedding) |
| GET | `/files` | List all files (optional `?content_type=` filter) |
| GET | `/file/{filename}/download` | Stream-download a file |
| DELETE | `/files/{filename}` | Delete file from storage and metadata |

---

## Setup & Installation

### Prerequisites

Make sure the following services are running locally before starting the app:

| Service | Default address |
|---|---|
| MongoDB | `localhost:27017` |
| MinIO | `localhost:9005` |
| Redis | `localhost:6379` |

---

### macOS

**1. Clone the repository**
```bash
git clone https://github.com/VikramSingh138/fastapi-file-system.git
cd fastapi-file-system
```

**2. Create and activate a virtual environment**
```bash
python3 -m venv venv
source venv/bin/activate
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Configure environment variables**

Copy the example env file and fill in your values:
```bash
cp .env.example .env
```

Edit `.env`:
```
MONGO_URL=mongodb://localhost:27017
MINIO_URL=localhost:9005
MINIO_USER=minioadmin
MINIO_PASSWORD=minioadmin
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX_NAME=fastapi-file-index
```

**5. Start the FastAPI server**
```bash
uvicorn main:app --reload
```

**6. Start the Celery worker** (in a separate terminal, with venv activated)
```bash
celery -A routers.worker worker --loglevel=info
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

---

### Windows

**1. Clone the repository**
```cmd
git clone https://github.com/VikramSingh138/fastapi-file-system.git
cd fastapi-file-system
```

**2. Create and activate a virtual environment**
```cmd
python -m venv venv
venv\Scripts\activate
```

**3. Install dependencies**
```cmd
pip install -r requirements.txt
```

**4. Configure environment variables**

Create a `.env` file in the project root:
```
MONGO_URL=mongodb://localhost:27017
MINIO_URL=localhost:9005
MINIO_USER=minioadmin
MINIO_PASSWORD=minioadmin
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX_NAME=fastapi-file-index
```

**5. Start the FastAPI server**
```cmd
uvicorn main:app --reload
```

**6. Start the Celery worker** (in a separate terminal, with venv activated)

> Note: Celery on Windows requires the `gevent` pool instead of the default `prefork` pool.

```cmd
celery -A routers.worker worker --loglevel=info --pool=gevent
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

---

## Architecture Overview

```
Client
  │
  ▼
FastAPI (main.py)
  │
  ├── MinIO ──────────── stores file binary
  ├── MongoDB ─────────── stores file metadata
  └── Redis (via Celery)
          │
          ▼
      Celery Worker (routers/worker.py)
          │
          ├── PyPDF / plain-text reader
          ├── LangChain RecursiveCharacterTextSplitter (500 chars / 50 overlap)
          ├── HuggingFace all-MiniLM-L6-v2 (local inference)
          └── Pinecone ── stores vector embeddings
```

When a file is uploaded:
1. The file is saved to MinIO and its metadata is written to MongoDB.
2. A Celery task is dispatched to Redis.
3. The worker picks up the task, extracts text, splits it into chunks, generates embeddings, and upserts them into Pinecone.

## Environment Variables

| Variable | Description |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `MINIO_URL` | MinIO server address (without `http://`) |
| `MINIO_USER` | MinIO access key |
| `MINIO_PASSWORD` | MinIO secret key |
| `PINECONE_API_KEY` | Your Pinecone API key |
| `PINECONE_INDEX_NAME` | Name of the Pinecone index to upsert embeddings into |
