import os
from pinecone import Pinecone
from dotenv import load_dotenv

load_dotenv()

pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index(os.getenv("PINECONE_INDEX_NAME"))

# Ask the database directly for its active stats
stats = index.describe_index_stats()
print("--- PINECONE REAL-TIME STATUS ---")
print(stats)