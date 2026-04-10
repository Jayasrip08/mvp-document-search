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
    embedding_function=embeddings
)

# ------------------ LOAD DOCUMENTS ------------------

def load_documents_to_db():
    if not os.path.exists(DOCS_PATH):
        print("❌ 'documents' folder not found")
        return

    documents = []

    for file in os.listdir(DOCS_PATH):
        if file.endswith(".pdf"):
            file_path = os.path.join(DOCS_PATH, file)

            try:
                with open(file_path, "rb") as f:
                    pdf = fitz.open(stream=f.read(), filetype="pdf")
                    text = ""
                    for page in pdf:
                        text += page.get_text()

                documents.append(
                    Document(
                        page_content=text,
                        metadata={"source": file}
                    )
                )

                print(f"✅ Loaded: {file}")

            except Exception as e:
                print(f"❌ Error loading {file}: {e}")

    if documents:
        db.add_documents(documents)
        print(f"🚀 Total documents loaded: {len(documents)}")
    else:
        print("⚠️ No documents found")

# 🔥 Load documents on startup
load_documents_to_db()

# ------------------ PDF TEXT EXTRACT ------------------

def extract_text(file):
    pdf = fitz.open(stream=file.file.read(), filetype="pdf")
    text = ""
    for page in pdf:
        text += page.get_text()
    return text

# ------------------ SEARCH API ------------------

@app.post("/search")
async def search(file: UploadFile):
    text = extract_text(file)

    results = db.similarity_search_with_score(text, k=4)

    output = []

    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        db_valid = True
    except:
        db_valid = False

    for r, score in results:
        similarity = round(max(0.0, min(100.0, (1 - score) * 100)), 2)

        file_name = r.metadata.get("source", "Unknown")

        output.append({
            "file": file_name,
            "text": r.page_content[:200],
            "full_text": r.page_content[:3000],
            "similarity": similarity
        })

    if db_valid:
        cur.close()
        conn.close()

    return {
        "count": len(output),
        "results": output
    }

# ------------------ VIEW DOCUMENT ------------------

@app.get("/document/{filename}")
def get_document(filename: str):
    file_path = os.path.join(DOCS_PATH, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename)
    return {"error": "File not found"}