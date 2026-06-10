import os
import io
from celery import Celery
from minio import Minio
from pinecone import Pinecone
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from pypdf import PdfReader
from dotenv import load_dotenv

load_dotenv()

MINIO_URL = os.getenv("MINIO_URL")
MINIO_USER = os.getenv("MINIO_USER")
MINIO_PASS = os.getenv("MINIO_PASSWORD")
PINECONE_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")

# INITIALIZE CELERY INSTANCE
celery_app = Celery(
    "vector_worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0"
)

# DEFINE INGESTION TASK USING CELERY APP

@celery_app.task(name = "worker.process_file_pipeline")
def process_file_pipeline(filename:str) :
    """
    This is a standard synchronous function now! Celery workers run 
    beautifully in a traditional sequential manner.
    """

    print(f"📦 Celery Worker claims task: Processing embeddings for '{filename}'")
    
    try:
        
        # the model is also loaded inside the thread only not globally 
        print("Loading local embed model inside Celery process...")
        embedding_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        
        # create standalone minio client inside worker thread
        minio_client = Minio(
            MINIO_URL,
            access_key = MINIO_USER,
            secret_key=MINIO_PASS,
            secure=False
        )

        # connect to Pinecone index

        pc = Pinecone(api_key = PINECONE_KEY)
        pinecone_index = pc.Index(PINECONE_INDEX_NAME)

        # PUll binary assest from MINIO storage

        response = minio_client.get_object(bucket_name="my-files", object_name=filename)
        raw_data = response.read()

        text_content = ""

        # D. Parse layout formats based on file extension
        if filename.lower().endswith(".pdf"):
            print(f"📄 PDF layout detected. Initializing binary page extraction stream...")
            pdf_stream = io.BytesIO(raw_data)
            reader = PdfReader(pdf_stream)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_content += page_text + "\n"
        else:
            print(f"📝 Plain text detected. Decoding string characters...")
            text_content = raw_data.decode("utf-8", errors="ignore")

        if not text_content.strip():
            print(f"⚠️ Task aborted: '{filename}' has no extractable text content.")
            return f"Skipped {filename} - No text."

        # E. Fragment text layout into small overlapping semantic chunks
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = text_splitter.split_text(text_content)
        print(f" -> Generated {len(chunks)} structural chunks for '{filename}'.")

        # F. Generate vector embeddings arrays and construct strict tuples
        vectors_to_upsert = []
        for i, chunk in enumerate(chunks):
            vector = embedding_model.embed_query(chunk)
            vector_tuple = (
                f"{filename}_chunk_{i}",
                vector,
                {"file_id": filename, "text": chunk}
            )
            vectors_to_upsert.append(vector_tuple)

        # G. Sync directly to Pinecone Vector Space cloud engine
        pinecone_index.upsert(vectors=vectors_to_upsert)
        print(f"🚀 Celery Task Complete! Uploaded {len(vectors_to_upsert)} vectors to Pinecone for '{filename}'!")
        return f"Successfully ingested {filename}"

    except Exception as e:
        print(f"❌ Critical Failure inside Celery processing thread for '{filename}': {e}")
        raise e