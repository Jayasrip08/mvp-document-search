from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document
import fitz
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel
import shutil

# ------------------ DATABASE ------------------

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id SERIAL PRIMARY KEY,
            filename VARCHAR NOT NULL,
            file_path VARCHAR NOT NULL,
            file_size INTEGER NOT NULL,
            upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    cur.close()
    conn.close()

try:
    init_db()
except Exception as e:
    print(f"Warning: DB init failed: {e}")

# ------------------ FASTAPI ------------------

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------ EMBEDDINGS + CHROMA ------------------

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROMA_PATH = os.path.join(BASE_DIR, "db")
DOCS_PATH = os.path.join(BASE_DIR, "documents")

db = Chroma(
    persist_directory=CHROMA_PATH,
    embedding_function=embeddings,
    collection_metadata={"hnsw:space": "cosine"}
)

# ------------------ LOAD DOCUMENTS ------------------

def load_documents_to_db():
    if not os.path.exists(DOCS_PATH):
        print("[ERROR] 'documents' folder not found")
        return

    documents = []
    ids = []

    for file in os.listdir(DOCS_PATH):
        if file.endswith(".pdf"):
            file_path = os.path.join(DOCS_PATH, file)

            try:
                with open(file_path, "rb") as f:
                    pdf = fitz.open(stream=f.read(), filetype="pdf")
                    
                    # Store pages separately for page-level retrieval
                    for page_num, page in enumerate(pdf, start=1):
                        text = page.get_text()
                        if text.strip():
                            # Create a deterministic ID for each page
                            doc_id = f"{file}_p{page_num}"
                            
                            documents.append(
                                Document(
                                    page_content=text,
                                    metadata={"source": file, "page": page_num}
                                )
                            )
                            ids.append(doc_id)

                print(f"[OK] Loaded: {file} ({pdf.page_count} pages)")

            except Exception as e:
                print(f"[ERROR] Error loading {file}: {e}")

    if documents:
        # Using ids ensures that re-indexing the same file updates existing entries instead of duplicating
        db.add_documents(documents, ids=ids)
        print(f"[DONE] Total chunks indexed: {len(documents)}")
    else:
        print("[INFO] No new documents to load")

# 🔥 Load documents on startup
load_documents_to_db()

# ------------------ PDF TEXT EXTRACT ------------------

def extract_text(file):
    pdf = fitz.open(stream=file.file.read(), filetype="pdf")
    text = ""
    for page in pdf:
        text += page.get_text()
    return text

@app.post("/search")
async def search(file: UploadFile):
    text = extract_text(file)
    results = db.similarity_search_with_score(text, k=15)
    return format_search_results(results)

def format_search_results(results):
    grouped_results = {}

    for r, score in results:
        # For Cosine distance, 0 is perfect match, 1 is orthogonal, 2 is opposite.
        # We cap distance at 1.0 to ensure positive similarity.
        similarity = round(max(0.0, (1 - score) * 100), 2)
        
        file_name = r.metadata.get("source", "Unknown")
        page_num = r.metadata.get("page", 1)

        if file_name not in grouped_results:
            grouped_results[file_name] = {
                "file": file_name,
                "similarity": similarity,
                "text": r.page_content[:200],
                "full_text": r.page_content[:3000],
                "matching_pages": {page_num}
            }
        else:
            grouped_results[file_name]["matching_pages"].add(page_num)
            if similarity > grouped_results[file_name]["similarity"]:
                grouped_results[file_name]["similarity"] = similarity
                grouped_results[file_name]["text"] = r.page_content[:200]
                grouped_results[file_name]["full_text"] = r.page_content[:3000]

    final_output = []
    for file_name, data in grouped_results.items():
        data["matching_pages"] = sorted(list(data["matching_pages"]))
        final_output.append(data)

    final_output.sort(key=lambda x: x["similarity"], reverse=True)

    return {
        "count": len(final_output),
        "results": final_output
    }

# ------------------ TEXT SEARCH API ------------------

class SearchQuery(BaseModel):
    query: str

@app.post("/text-search")
async def text_search(search: SearchQuery):
    results = db.similarity_search_with_score(search.query, k=15)
    return format_search_results(results)

# ------------------ RESET API ------------------

@app.post("/reset")
async def reset_database():
    try:
        # 1. Clear PostgreSQL
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("TRUNCATE TABLE documents RESTART IDENTITY")
        conn.commit()
        cur.close()
        conn.close()

        # 2. Clear ChromaDB
        global db
        try:
            # On Windows, deleting the directory while the process is running is tricky.
            # We'll delete the collection instead, which clears the data.
            db.delete_collection()
        except Exception as e:
            print(f"Warning: could not delete collection: {e}")
        
        # Re-initialize a clean Chroma instance
        db = Chroma(
            persist_directory=CHROMA_PATH,
            embedding_function=embeddings,
            collection_metadata={"hnsw:space": "cosine"}
        )

        # 3. Clear Documents Folder
        if os.path.exists(DOCS_PATH):
            for file in os.listdir(DOCS_PATH):
                file_path = os.path.join(DOCS_PATH, file)
                if os.path.isfile(file_path):
                    try:
                        os.unlink(file_path)
                    except Exception as e:
                        print(f"Warning: could not delete file {file}: {e}")

        return {"status": "success", "message": "Database cleared and reset with Cosine similarity"}
    except Exception as e:
        print(f"Error resetting database: {e}")
        return {"status": "error", "message": str(e)}

# ------------------ STATS API ------------------

@app.get("/stats")
async def get_stats():
    try:
        data = db.get(include=['metadatas'])
        if not data['metadatas']:
            return {"document_count": 0}
        
        unique_sources = set(m.get("source") for m in data['metadatas'])
        return {"document_count": len(unique_sources)}
    except Exception as e:
        print(f"Error fetching stats: {e}")
        return {"document_count": 0, "error": str(e)}

# ------------------ VIEW DOCUMENT ------------------

@app.get("/document/{filename}")
def get_document(filename: str):
    file_path = os.path.join(DOCS_PATH, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename)
    return {"error": "File not found"}