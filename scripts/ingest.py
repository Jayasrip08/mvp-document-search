import os
import psycopg2
import fitz

def extract_text(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    return text

from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from dotenv import load_dotenv

# load the global env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")

embeddings = OpenAIEmbeddings()
db = Chroma(persist_directory="../db", embedding_function=embeddings)
DOCUMENTS_PATH = "../documents"

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
                cur.execute(
                    "INSERT INTO documents (filename, file_path, file_size) VALUES (%s, %s, %s) RETURNING id",
                    (file, path, file_size)
                )
                doc_id = cur.fetchone()[0]
                conn.commit()
            else:
                doc_id = db_doc[0]

            text = extract_text(path)

            # Add to ChromaDB linked via Postgres ID
            db.add_texts([text], metadatas=[{"postgres_id": doc_id, "source": file}])

    # Save DB
    db.persist()
    cur.close()
    conn.close()
    print("✅ All documents stored in ChromaDB and PostgreSQL")

if __name__ == "__main__":
    ingest()