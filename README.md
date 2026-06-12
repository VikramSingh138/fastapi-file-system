# FastAPI File System

A full-stack cloud file management system with semantic search and RAG (Retrieval-Augmented Generation) capabilities. Upload PDF and text files via a React dashboard, store them in MinIO object storage, track metadata in MongoDB, and automatically generate vector embeddings via a Celery background worker — stored in Pinecone for semantic retrieval and Gemini-powered Q&A. Access is protected by JWT authentication with support for both traditional email/password login and Google OAuth2.

## Features

- **Authentication** — JWT-based login with traditional email/password or Google OAuth2 sign-in
- **Role-Based Access Control** — `admin` role can upload and delete files; `user` role can browse and download
- **Presigned URL Uploads** — Files are transferred directly from the browser to MinIO storage using a two-phase presigned URL handshake, bypassing the FastAPI server for the binary payload
- **File Management** — List, download, and delete files via a React dashboard
- **Async Embedding Pipeline** — Celery worker automatically chunks uploaded files and generates vector embeddings in the background via Redis task queue
- **Vector Storage** — Embeddings stored in Pinecone using HuggingFace `all-MiniLM-L6-v2`
- **Semantic Retrieval** — Query your uploaded documents by natural language; Pinecone returns the most relevant text chunks filtered by selected file scope
- **RAG Q&A** — Full Retrieval-Augmented Generation pipeline: retrieved context blocks are fed into Gemini 2.5 Flash to produce grounded, document-aware answers
- **Chat UI** — Tabbed React dashboard with a dedicated chat interface: select source files, configure top-k, and get Markdown-rendered answers with expandable source-chunk citations

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + React Router v6 |
| API framework | FastAPI + Uvicorn |
| Authentication | JWT (PyJWT + bcrypt) + Google OAuth2 |
| Object storage | MinIO (S3-compatible, presigned URL upload) |
| Metadata store | MongoDB (Motor async driver) |
| Task queue | Celery + Redis |
| Embeddings model | HuggingFace `sentence-transformers/all-MiniLM-L6-v2` |
| Vector database | Pinecone |
| LLM (RAG synthesis) | Google Gemini 2.5 Flash |
| Text extraction | PyPDF + LangChain RecursiveCharacterTextSplitter |
| Markdown rendering | react-markdown + remark-gfm |

---

## Core Mechanisms

### 1. Two-Phase Presigned URL Upload

Rather than streaming file bytes through the FastAPI server, uploads are split into two steps that keep the API server stateless for binary data:

```
Browser                          FastAPI                      MinIO
  │                                 │                            │
  │── POST /files/generate-upload-url ──▶                        │
  │      {filename, content_type}   │                            │
  │                                 │── presigned_put_object ──▶ │
  │                                 │◀── signed URL (15 min TTL) │
  │◀── {upload_url, file_id} ───────│                            │
  │                                 │                            │
  │── PUT {upload_url} (raw binary) ────────────────────────────▶│
  │◀── 200 OK ──────────────────────────────────────────────────│
  │                                 │                            │
  │── POST /files/upload-complete ──▶                            │
  │      {file_id, filename, ...}   │── insert metadata ──▶ MongoDB
  │                                 │── dispatch task ──▶ Redis
  │◀── 200 Asset indexed ───────────│                            │
```

**Phase 1** (`POST /files/generate-upload-url`) — The backend asks MinIO to mint a time-limited (15 min) signed PUT URL for the specific object key and returns it along with a unique `file_id`. No binary data touches FastAPI.

**Phase 2** (`POST /files/upload-complete`) — After the browser confirms the direct PUT to MinIO succeeded, it notifies the backend. FastAPI writes the file metadata to MongoDB and dispatches the embedding task to the Celery/Redis queue.

---

### 2. Async Embedding Pipeline (Celery Worker)

Once a file is registered, a background Celery task handles the heavy lifting of turning file content into searchable vectors:

```
Redis Queue
    │
    ▼
Celery Worker (routers/worker.py)
    │
    ├── Pull binary from MinIO
    │
    ├── Extract text
    │     ├── PDF  → PyPDF page-by-page extraction
    │     └── Text → UTF-8 decode
    │
    ├── Chunk with RecursiveCharacterTextSplitter
    │     └── chunk_size=500 chars, overlap=50 chars
    │
    ├── Embed each chunk
    │     └── HuggingFace all-MiniLM-L6-v2 (local inference, 384-dim)
    │
    └── Upsert vectors to Pinecone
          └── Each vector keyed as {file_id}_chunk_{i}
              with metadata: {file_id, text}
```

The worker runs as a completely independent process — it initialises its own MinIO and Pinecone clients internally so it has no dependency on the FastAPI app state.

---

### 3. Semantic Retrieval & RAG Query Pipeline

Uploaded and embedded documents can be queried in two modes:

**Retrieval-only** (`POST /rag/retrieve-only`) — Embeds the user's question with the same `all-MiniLM-L6-v2` model, runs a cosine-similarity search in Pinecone scoped to the user-selected file IDs, and returns the top-k most relevant text chunks with their similarity scores.

**Full RAG** (`POST /rag/queryr`) — Runs the same retrieval step, then assembles the retrieved chunks into a structured context block and passes it to Gemini 2.5 Flash with a strict grounding prompt:

```
User question + selected_file_ids
        │
        ▼
  Embed question (all-MiniLM-L6-v2)
        │
        ▼
  Pinecone vector search
  (filtered to selected_file_ids, top_k=4)
        │
        ▼
  Compile context chunks
        │
        ▼
  Gemini 2.5 Flash
  (system-grounded: answer from docs only)
        │
        ▼
  RAGResponse { answer, sources_used }
```

Gemini is instructed to answer strictly from the provided document context and to explicitly refuse if the answer is not present in the retrieved chunks.

---

## Project Structure

```
fastapi-file-system/
├── backend/
│   ├── main.py                    # FastAPI app entry point, service bindings
│   ├── requirements.txt
│   ├── .env                       # Backend environment variables
│   ├── routers/
│   │   ├── auth.py                # Register, login, Google OAuth2 callback
│   │   ├── files.py               # Presigned URL generation, upload-complete, list, download, delete
│   │   ├── worker.py              # Celery task — embedding pipeline
│   │   └── rag.py                 # Vector retrieval + Gemini RAG endpoints
│   └── dependencies/
│       └── auth_guard.py          # JWT decoder + RoleChecker dependency
└── frontend/
    ├── src/
    │   ├── App.jsx                # Router + auth state
    │   └── components/
    │       ├── Login.jsx          # Traditional + Google OAuth login
    │       ├── Dashboard.jsx      # Tabbed shell: Files tab + Chat tab
    │       └── Chatbot.jsx        # Chat UI: file selector, top-k slider, Markdown-rendered RAG answers with source citations
    ├── .env                       # Frontend environment variables
    └── package.json
```

---

## API Endpoints

### Authentication — `/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | None | Register a new user |
| POST | `/auth/login/traditional` | None | Login with email + password, returns JWT |
| GET | `/auth/oauth2/google/callback` | None | Google OAuth2 callback handler |

### Files — `/files`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | None | Health check |
| GET | `/status` | None | App status and version |
| POST | `/files/generate-upload-url` | Admin only | Phase 1: mint a presigned MinIO PUT URL |
| POST | `/files/upload-complete` | Admin only | Phase 2: register metadata + trigger embedding |
| GET | `/files` | Any user | List all files (optional `?content_type=` filter) |
| GET | `/files/{filename}/download` | Any user | Stream-download a file |
| DELETE | `/files/{filename}` | Admin only | Delete file from storage and metadata |

### RAG — `/rag`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/rag/retrieve-only` | Any user | Return top-k Pinecone chunks for a query, scoped to selected files |
| POST | `/rag/queryr` | Any user | Full RAG: retrieve context + Gemini-synthesized answer |

**RAG request body:**
```json
{
  "question": "What are the key findings?",
  "selected_file_ids": ["doc_1234_report.pdf"],
  "top_k": 4
}
```

---

## Setup & Installation

### Prerequisites

Ensure the following services are running before starting the app:

| Service | Default address |
|---|---|
| MongoDB | `localhost:27017` |
| MinIO | `localhost:9005` |
| Redis | `localhost:6379` |

You will also need:
- A [Pinecone](https://www.pinecone.io/) account and API key with an index named `fastapi-file-index` (dimension: 384, metric: cosine)
- A [Google Cloud](https://console.cloud.google.com/) project with OAuth2 credentials (for Google login)
- A [Google AI Studio](https://aistudio.google.com/) API key for Gemini (for RAG Q&A)

---

### Backend

**1. Clone the repository**
```bash
git clone https://github.com/VikramSingh138/fastapi-file-system.git
cd fastapi-file-system/backend
```

**2. Create and activate a virtual environment**

macOS / Linux:
```bash
python3 -m venv .venv
source .venv/bin/activate
```

Windows:
```cmd
python -m venv .venv
.venv\Scripts\activate
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Configure environment variables**

Create a `.env` file inside the `backend/` directory:
```env
# MongoDB
MONGO_URL=mongodb://localhost:27017

# MinIO
MINIO_URL=localhost:9005
MINIO_USER=minioadmin
MINIO_PASSWORD=minioadmin

# Pinecone
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX_NAME=fastapi-file-index

# JWT
JWT_SECRET_KEY=your_random_secret_key_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Google OAuth2
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/oauth2/google/callback

# Gemini (RAG)
GEMINI_API_KEY=your_gemini_api_key_here
```

**5. Start the FastAPI server**
```bash
uvicorn main:app --reload
```

**6. Start the Celery worker** (in a separate terminal, inside `backend/` with venv activated)

macOS / Linux:
```bash
celery -A routers.worker worker --loglevel=info
```

Windows (requires `gevent`):
```cmd
celery -A routers.worker worker --loglevel=info --pool=gevent
```

Backend API: `http://localhost:8000`  
Interactive docs: `http://localhost:8000/docs`

---

### Frontend

**1. Navigate to the frontend directory**
```bash
cd fastapi-file-system/frontend
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure environment variables**

Create a `.env` file inside the `frontend/` directory:
```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

**4. Start the development server**
```bash
npm run dev
```

Frontend app: `http://localhost:5173`

---

## Architecture Overview

```
Browser (React + Vite)
  │
  ├── Auth requests ──────────────────────────────── FastAPI /auth
  │                                                     └── MongoDB (users)
  │
  ├── Phase 1: generate-upload-url ──────────────── FastAPI /files
  │                                                     └── MinIO (presigned URL)
  │
  ├── Phase 2: PUT binary ──────────────────────────── MinIO (direct, no FastAPI)
  │
  ├── Phase 3: upload-complete ──────────────────── FastAPI /files
  │                                                     ├── MongoDB (metadata)
  │                                                     └── Redis (Celery task dispatch)
  │                                                              │
  │                                                              ▼
  │                                                     Celery Worker
  │                                                        ├── MinIO (fetch binary)
  │                                                        ├── PyPDF / text decode
  │                                                        ├── LangChain chunker
  │                                                        ├── HuggingFace embeddings
  │                                                        └── Pinecone (upsert)
  │
  └── RAG queries ──────────────────────────────── FastAPI /rag
                                                       ├── HuggingFace (embed question)
                                                       ├── Pinecone (top-k retrieval)
                                                       └── Gemini 2.5 Flash (synthesis)
```

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `MINIO_URL` | MinIO server address (no `http://`) |
| `MINIO_USER` | MinIO access key |
| `MINIO_PASSWORD` | MinIO secret key |
| `PINECONE_API_KEY` | Pinecone API key |
| `PINECONE_INDEX_NAME` | Pinecone index name |
| `JWT_SECRET_KEY` | Secret key used to sign JWT tokens |
| `JWT_ALGORITHM` | JWT signing algorithm (default: `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token TTL in minutes (default: `60`) |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret |
| `GOOGLE_REDIRECT_URI` | OAuth2 callback URI registered in Google Cloud |
| `GEMINI_API_KEY` | Google AI Studio key for Gemini RAG synthesis |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth2 client ID (must match backend) |
