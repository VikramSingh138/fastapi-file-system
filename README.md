# FastAPI File System

A full-stack cloud file management system with semantic search capabilities. Upload PDF and text files via a React dashboard, store them in MinIO object storage, track metadata in MongoDB, and automatically generate vector embeddings via a Celery background worker — stored in Pinecone for future semantic search. Access is protected by JWT authentication with support for both traditional email/password login and Google OAuth2.

## Features

- **Authentication** — JWT-based login with traditional email/password or Google OAuth2 sign-in
- **Role-Based Access Control** — `admin` role can upload and delete files; `user` role can browse and download
- **File Upload** — Upload PDF and plain-text files to MinIO (S3-compatible object storage)
- **File Management** — List, download, and delete files via a React dashboard
- **Async Embeddings** — Celery worker automatically chunks uploaded files and generates vector embeddings in the background
- **Vector Storage** — Embeddings stored in Pinecone using HuggingFace `all-MiniLM-L6-v2`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + React Router v6 |
| API framework | FastAPI + Uvicorn |
| Authentication | JWT (PyJWT + bcrypt) + Google OAuth2 |
| Object storage | MinIO |
| Metadata store | MongoDB (Motor async driver) |
| Task queue | Celery + Redis |
| Embeddings model | HuggingFace `sentence-transformers/all-MiniLM-L6-v2` |
| Vector database | Pinecone |
| Text extraction | PyPDF + LangChain RecursiveCharacterTextSplitter |

---

## Project Structure

```
fastapi-file-system/
├── backend/
│   ├── main.py                    # FastAPI app entry point
│   ├── requirements.txt
│   ├── .env                       # Backend environment variables
│   ├── routers/
│   │   ├── auth.py                # Register, login, Google OAuth callback
│   │   ├── files.py               # Upload, list, download, delete endpoints
│   │   └── worker.py              # Celery task — embedding pipeline
│   └── dependencies/
│       └── auth_guard.py          # JWT decoder + RoleChecker dependency
└── frontend/
    ├── src/
    │   ├── App.jsx                # Router + auth state
    │   └── components/
    │       ├── Login.jsx          # Traditional + Google OAuth login
    │       └── Dashboard.jsx      # File management UI
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

### Files

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | None | Health check |
| GET | `/status` | None | App status and version |
| POST | `/upload` | Admin only | Upload a file (triggers background embedding) |
| GET | `/files` | Any user | List all files (optional `?content_type=` filter) |
| GET | `/file/{filename}/download` | Any user | Stream-download a file |
| DELETE | `/files/{filename}` | Admin only | Delete file from storage and metadata |

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
  ▼
FastAPI (backend/main.py)
  │
  ├── /auth ─────────────────── JWT tokens + Google OAuth2
  │                              stored users in MongoDB
  │
  ├── MinIO ──────────────────── stores file binary
  ├── MongoDB ────────────────── stores file metadata + users
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

**Upload flow:**
1. Authenticated admin uploads a file → saved to MinIO, metadata written to MongoDB
2. A Celery task is dispatched to Redis
3. The worker picks up the task, extracts text, chunks it, generates embeddings, and upserts into Pinecone

**Auth flow:**
- Traditional login: `POST /auth/login/traditional` → verifies bcrypt hash → returns JWT
- Google login: browser redirects to Google → Google sends `code` to `/auth/oauth2/google/callback` → backend exchanges code for profile → issues JWT → redirects to frontend with token

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

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth2 client ID (must match backend) |
