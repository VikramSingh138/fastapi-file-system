import os
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Request, Depends, status
from pydantic import BaseModel, Field
import google.generativeai as genai

from dependencies.auth_guard import get_current_user_metadata

router = APIRouter(prefix="/rag", tags=["RAG Reasoning Workspace"])

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

#=======================
# PYDANTIC DATA MODELS 
# =====================

class RAGRequest(BaseModel):
    question : str
    selected_file_ids : List[str]
    top_k : Optional[int] = 4

class RetrievalChunk(BaseModel):
    score : float 
    file_id : str
    text : str

class RAGResponse(BaseModel) : 
    status: str
    answer: str
    sources_used: List[RetrievalChunk]

# ==========================================
# REUSABLE CORE RETRIEVAL ENGINE
# ==========================================

def perform_vector_retrieval(payload : RAGRequest, request: Request) -> List[RetrievalChunk]:

    if not payload.selected_file_ids:
        raise HTTPException(status_code = 400 , detail = "Context boundary array cannot be empty" )
    
    pinecone_index = getattr(request.app.state, "pinecone_index", None)
    if not pinecone_index : 
        raise HTTPException(status_code=500 , detail="Pinecone vector engine is offline or unmapped")
    
    try :
        from langchain_community.embeddings import HuggingFaceEmbeddings
        embeddings_model = HuggingFaceEmbeddings(model_name = "all-MiniLM-L6-v2")

        # embedding the query 
        query_vector = embeddings_model.embed_query(payload.question)

        # only search from files that user selected
        metadata_filter = {"file_id" : {"$in": payload.selected_file_ids}}

        pinecone_results = pinecone_index.query(
            vector=query_vector,
            top_k=payload.top_k,
            filter=metadata_filter,
            include_metadata=True
        )

        formatted_chunks = []
        for match in pinecone_results.get("matches",[]):
            formatted_chunks.append(
                    RetrievalChunk(
                        score = round(match.get("score", 0.0), 4),
                        file_id = match.get("metadata", {}).get("file_id", "Unknown ID"),
                        text = match.get("metadata", {}).get("text", "")
                    )
            )

        return formatted_chunks
    
    except Exception as e :
        raise HTTPException(status_code = 500 , detail = f"Pinecone lookup failure : str{e}")
    
# ==========================================
# ENDPOINTS AND ROUTING LOGIC
# ==========================================

@router.post("/retrieve-only", response_model = List[RetrievalChunk], dependencies = [Depends(get_current_user_metadata)])
async def retrieve_context_blocks(payload : RAGRequest, request: Request):
    
    """
    TESTING ENDPOINT: Direct search tool that extracts bounded context blocks from 
    Pinecone based on the selected files before sending anything to the LLM.
    """
    return perform_vector_retrieval(payload , request)

@router.post("/queryr", response_model=RAGResponse, dependencies=[Depends(get_current_user_metadata)])
async def query_rag_pipeline(payload : RAGRequest, request: Request):
    """
    RAG SYNTHESIS ENDPOINT: Extracts context from selected files and uses Gemini 
    to generate an accurate, grounded response.
    """

    if not GEMINI_API_KEY:
        raise HTTPException(status_code = 500 , detail = "Gemini API env config key is missing")
    
    # Retrieve vector text blocks 

    context_chunks = perform_vector_retrieval(payload , request)

    if not context_chunks:
        return RAGResponse(
            status = "no_context_found",
            answer = " No relevant info was found inside selected source domains",
            sources_used = []
        )
    
    # Compile text fragments into context blocks 
    compiled_context = "\n\n".join([f"Source: {chunk.file_id}]\n{chunk.text}" for chunk in context_chunks])

    # construct system prompt 

    system_instruction = (
        "You are an advanced, document-aware reading assistant.\n"
        "Your task is to answer the user's question using ONLY the provided source documents below.\n"
        "Adhere strictly to these operational guidelines:\n"
        "1. Base your answer solely on the shared context text fragments.\n"
        "2. Do not look or lean on any external training knowledge or assumptions.\n"
        "3. If the answer cannot be confidently formulated from the text blocks, say exactly: "
        "'I am sorry, but the selected documents do not contain sufficient data to answer your question.'\n\n"
        f"--- START SOURCE DOCS CONTEXT ---\n{compiled_context}\n--- END SOURCE DOCS CONTEXT ---\n"
    )


    try : 
        # initialize model gemini
        model = genai.GenerativeModel('gemini-2.5-flash')

        user_prompt = (
            f"--- START SOURCE DOCS CONTEXT ---\n{compiled_context}\n--- END SOURCE DOCS CONTEXT ---\n\n"
            f"User Question: {payload.question}"
        )

        # combine instruction and user input 
        response = model.generate_content(user_prompt)

        return RAGResponse(
            status = "success",
            answer = response.text,
            sources_used =context_chunks
        )

    except Exception as e :
        raise HTTPException(status_code = 500 , detail = f"Gemini API inference crashed : str{e}")