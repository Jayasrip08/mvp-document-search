# main.py
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from langchain_chroma import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
import fitz
import os
import psycopg2
from psycopg2.extras import RealDictCursor

# -------------------------
# Configuration
# -------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://postgres:1234@localhost:5432/document_search"
)
DOCUMENTS_DIR = os.getenv("DOCUMENTS_DIR", "../documents")
CHROMA_DIR = os.getenv("CHROMA_DIR", "../db")

# -------------------------
# Database utilities
# -------------------------
def get_db_connection():
    return psycopg2.connect(DATABASE_URL)


def init_db():
    """Initialize the documents table if it does not exist"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id SERIAL PRIMARY KEY,
            filename VARCHAR NOT NULL,
            file_path VARCHAR NOT NULL,
            file_size INTEGER NOT NULL,
            upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """
    )
    conn.commit()
    cur.close()
    conn.close()


# Initialize DB on startup
try:
    init_db()
except Exception as e:
    print(f"Warning: Could not initialize database. Error: {e}")

# -------------------------
# FastAPI setup
# -------------------------
app = FastAPI(title="Document Search API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# Embeddings and Vector Store
# -------------------------
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
db = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)

# -------------------------
# Helpers
# -------------------------
def extract_text(file: UploadFile) -> str:
    """Extract text from a PDF UploadFile"""
    pdf = fitz.open(stream=file.file.read(), filetype="pdf")
    text = ""
    for page in pdf:
        text += page.get_text()
    return text


def perform_search(query_text: str):
    """Perform Chroma similarity search and return structured results"""
    try:
        results = db.similarity_search_with_score(query_text, k=4)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector search failed: {e}")

    output = []
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        db_valid = True
    except Exception as e:
        print(f"Database connection failed: {e}")
        db_valid = False

    for r, score in results:
        similarity = round(max(0.0, min(100.0, (1 - score) * 100)), 2)
        pg_id = r.metadata.get("postgres_id")
        file_name = r.metadata.get("source", "Unknown")

        if pg_id and db_valid:
            cur.execute("SELECT filename FROM documents WHERE id = %s", (pg_id,))
            pg_doc = cur.fetchone()
            if pg_doc:
                file_name = pg_doc["filename"]

        output.append(
            {
                "file": file_name,
                "text": r.page_content[:200],  # snippet
                "full_text": r.page_content[:3000],  # limited full text
                "similarity": similarity,
            }
        )

    if db_valid:
        cur.close()
        conn.close()

    return {"count": len(output), "results": output}


# -------------------------
# API Endpoints
# -------------------------
@app.post("/search")
async def search_post(file: UploadFile):
    """Search for similar documents based on uploaded PDF"""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    text = extract_text(file)
    return perform_search(text)


@app.get("/search")
async def search_get(query: str = Query(None, description="Query text to search")):
    """Search using query string (optional for browser testing)"""
    if not query or not query.strip():
        return {"count": 0, "results": []}
    return perform_search(query.strip())


@app.get("/document/{filename}")
def get_document(filename: str):
    """Download the original document by filename"""
    file_path = os.path.join(DOCUMENTS_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename)
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/favicon.ico")
async def favicon():
    path = "favicon.ico"
    if os.path.exists(path):
        return FileResponse(path)
    return JSONResponse(status_code=404, content={"detail": "Not Found"})