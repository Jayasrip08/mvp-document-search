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
        os.makedirs(DOCS_PATH, exist_ok=True)
        return

    conn = get_db_connection()
    cur = conn.cursor()

    for file in os.listdir(DOCS_PATH):
        if file.endswith(".pdf"):
            file_path = os.path.join(DOCS_PATH, file)
            file_size = os.path.getsize(file_path)

            # 1. Sync with PostgreSQL
            cur.execute("SELECT id FROM documents WHERE filename = %s", (file,))
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO documents (filename, file_path, file_size) VALUES (%s, %s, %s)",
                    (file, file_path, file_size)
                )
                conn.commit()

            # 2. Sync with ChromaDB
            try:
                # Check if file is already in Chroma by querying metadatas
                existing = db.get(where={"source": file})
                if not existing or not existing['ids']:
                    with open(file_path, "rb") as f:
                        pdf = fitz.open(stream=f.read(), filetype="pdf")
                        documents = []
                        ids = []
                        for page_num, page in enumerate(pdf, start=1):
                            text = page.get_text()
                            if text.strip():
                                doc_id = f"{file}_p{page_num}"
                                documents.append(
                                    Document(
                                        page_content=text,
                                        metadata={"source": file, "page": page_num}
                                    )
                                )
                                ids.append(doc_id)
                        
                        if documents:
                            db.add_documents(documents, ids=ids)
                            print(f"[OK] Indexed: {file}")
            except Exception as e:
                print(f"[ERROR] Syncing {file}: {e}")

    cur.close()
    conn.close()

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
    # 1. Save file to disk
    os.makedirs(DOCS_PATH, exist_ok=True)
    file_path = os.path.join(DOCS_PATH, file.filename)
    
    file_content = await file.read()
    with open(file_path, "wb") as f:
        f.write(file_content)
    
    file_size = len(file_content)

    # 2. Update PostgreSQL
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM documents WHERE filename = %s", (file.filename,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO documents (filename, file_path, file_size) VALUES (%s, %s, %s)",
            (file.filename, file_path, file_size)
        )
        conn.commit()
    cur.close()
    conn.close()

    # 3. Process with fitz (PyMuPDF)
    pdf = fitz.open(stream=file_content, filetype="pdf")
    
    # 4. Update ChromaDB
    documents = []
    ids = []
    full_text = ""
    for page_num, page in enumerate(pdf, start=1):
        text = page.get_text()
        if text.strip():
            full_text += text
            doc_id = f"{file.filename}_p{page_num}"
            documents.append(
                Document(
                    page_content=text,
                    metadata={"source": file.filename, "page": page_num}
                )
            )
            ids.append(doc_id)
    
    if documents:
        db.add_documents(documents, ids=ids)

    # 5. Search
    # We use the extracted text to search from the updated DB
    results = db.similarity_search_with_score(full_text[:5000], k=15)
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