import os
import psycopg2
import fitz

def extract_text(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    return text

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from dotenv import load_dotenv

# load the global env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
db = Chroma(persist_directory=os.path.join(BASE_DIR, "db"), embedding_function=embeddings)
DOCUMENTS_PATH = os.path.join(BASE_DIR, "documents")

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def ingest():
    conn = get_db_connection()
    cur = conn.cursor()
    
    for file in os.listdir(DOCUMENTS_PATH):
        if file.endswith(".pdf"):
            path = os.path.join(DOCUMENTS_PATH, file)
            file_size = os.path.getsize(path)

            print(f"Processing: {file}")

            # Check if file exists in DB
            cur.execute("SELECT id FROM documents WHERE filename = %s", (file,))
            db_doc = cur.fetchone()
            
            if not db_doc:
                # Insert and return ID directly
                file_path = os.path.join(os.path.dirname(BASE_DIR), "documents", file)
                cur.execute(
                    "INSERT INTO documents (filename, file_path, file_size) VALUES (%s, %s, %s) RETURNING id",
                    (file, file_path, file_size)
                )
                doc_id = cur.fetchone()[0]
                conn.commit()
            else:
                doc_id = db_doc[0]

            text = extract_text(path)

            # Add to ChromaDB linked via Postgres ID
            db.add_texts([text], metadatas=[{"postgres_id": doc_id, "source": file}])

    # ChromaDB v0.4+ auto-persists — no need to call db.persist()
    cur.close()
    conn.close()
    print("✅ All documents stored in ChromaDB and PostgreSQL")

if __name__ == "__main__":
    ingest()