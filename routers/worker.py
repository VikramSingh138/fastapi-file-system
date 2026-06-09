import os
import asyncio
import io
from fastapi import FastAPI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from pinecone import Pinecone
from dotenv import load_dotenv
from pypdf import PdfReader

load_dotenv()

#1) download a local lightweight embeddings model 

print("Loading local embed model .....")
embedding_model = HuggingFaceEmbeddings(model_name = "all-MiniLM-L6-v2")

# 2) connect to pinecone using hidden env keys
PINECONE_KEY = os.getenv("PINECONE_API_KEY")
INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")

print("Loading local embed model .....")
embedding_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

print("Connecting to Pinecone DB...")
if not PINECONE_KEY or not INDEX_NAME:
    print("⚠️ WARNING: Pinecone credentials missing from .env file!")
    pinecone_index = None
else:
    pc = Pinecone(api_key=PINECONE_KEY)
    pinecone_index = pc.Index(INDEX_NAME)

# 3. Create a global async queue

task_queue = asyncio.Queue()

async def process_file_worker():

    if pinecone_index is None:
        print("❌ Background Worker aborted: Pinecone index not initialized.")
        return

    print("Background Ingestion Worker Started successfully! Watching for tasks...")

    while True:

        app_state, filename = await task_queue.get()
        print(f"📦 Worker picked up task: Processing embeddings for '{filename}'")

        try :

            # fetch files outta minio

            minio_client = app_state.minio_client
            response = minio_client.get_object(bucket_name="my-files", object_name=filename)
            raw_data = response.read()

            text_content = ""

            if filename.lower().endswith(".pdf"):
                print(f"Detected pdf file, extracting raw binary stream")

                pdf_stream = io.BytesIO(raw_data)
                reader = PdfReader(pdf_stream)

                for page_num , page in enumerate(reader.pages):
                    page_text = page.extract_text()
                    if page_text : 
                        text_content += page_text + "\n"

            else :
                # fallback to default plain txt route 

                print(f"Detected standard text format")
                text_content = raw_data.decode("utf-8", errors="ignore")


            if not text_content.strip():
                print(f"⚠️ Worker Warning: '{filename}' contains no readable text. Skipping.")
                task_queue.task_done()
                continue

            # chunking the text

            text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
            chunks = text_splitter.split_text(text_content)
            print(f" -> Split '{filename}' into {len(chunks)} text chunks.")


            # generate embeddings and upset to pinecone 

            vectors_to_upsert = []

            for i , chunk in enumerate(chunks):
                
                # geneate embedddings
                vector = embedding_model.embed_query(chunk)

                # create metadata fo this to retrive text
                vectors_to_upsert.append({
                    "id": f"{filename}_chunk_{i}", # Unique vector ID
                    "values": vector,               # The mathematical array list
                    "metadata": {
                        "filename": filename,
                        "text": chunk                # Storing the actual text inside the vector object
                    }
                })

            # Batch push to pinecone 

            pinecone_index.upsert(vectors = vectors_to_upsert)
            print(f"🚀 Successfully uploaded {len(vectors_to_upsert)} vectors to Pinecone for '{filename}'!")

        except Exception as e:
            print(f"❌ Worker Error processing '{filename}': {e}")

        task_queue.task_done()
