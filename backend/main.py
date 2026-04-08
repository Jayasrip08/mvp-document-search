from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
import fitz
import os
import psycopg2
from psycopg2.extras import RealDictCursor

# Database URL
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

# Initialize tables automatically when application loads
try:
    init_db()
except Exception as e:
    print(f"Warning: Could not initialize database. Error: {e}")

app = FastAPI()

# ✅ Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Load bindings
embeddings = OpenAIEmbeddings()
db = Chroma(persist_directory="../db", embedding_function=embeddings)

def extract_text(file):
    pdf = fitz.open(stream=file.file.read(), filetype="pdf")
    text = ""
    for page in pdf:
        text += page.get_text()
    return text

@app.post("/search")
async def search(file: UploadFile):
    text = extract_text(file)
    results = db.similarity_search_with_score(text, k=4)
    output = []

    # Get DB connection for metadata fetches
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        db_valid = True
    except Exception:
        db_valid = False

    for r, score in results:
        similarity = round((1 - score) * 100, 2)
        
        pg_id = r.metadata.get("postgres_id")
        file_name = r.metadata.get("source", "Unknown")
        
        if pg_id and db_valid:
            cur.execute("SELECT filename FROM documents WHERE id = %s", (pg_id,))
            pg_doc = cur.fetchone()
            if pg_doc:
                file_name = pg_doc["filename"]

        output.append({
            "file": file_name,
            "text": r.page_content[:200],
            "similarity": similarity
        })

    if db_valid:
        cur.close()
        conn.close()

    return {
        "count": len(output),
        "results": output
    }

@app.get("/document/{filename}")
def get_document(filename: str):
    file_path = f"../documents/{filename}"
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename)
    return {"error": "File not found"}