import os
import sys
from extract_text import extract_text
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma

# Add backend to path to import database and models
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from database import SessionLocal
import models

# Load embedding model
embeddings = OpenAIEmbeddings()

# Create DB
db = Chroma(persist_directory="../db", embedding_function=embeddings)

DOCUMENTS_PATH = "../documents"

def ingest():
    db_session = SessionLocal()
    for file in os.listdir(DOCUMENTS_PATH):
        if file.endswith(".pdf"):
            path = os.path.join(DOCUMENTS_PATH, file)
            file_size = os.path.getsize(path)

            print(f"Processing: {file}")

            # 1. Add to Postgres first to get the unique ID
            db_doc = db_session.query(models.DocumentMetadata).filter_by(filename=file).first()
            if not db_doc:
                db_doc = models.DocumentMetadata(
                    filename=file,
                    file_path=path,
                    file_size=file_size
                )
                db_session.add(db_doc)
                db_session.commit()
                db_session.refresh(db_doc)

            text = extract_text(path)

            # 2. Add to ChromaDB linked via the Postgres ID
            db.add_texts([text], metadatas=[{"postgres_id": db_doc.id, "source": file}])

    # Save DB
    db.persist()
    db_session.close()
    print("✅ All documents stored in ChromaDB and PostgreSQL")

if __name__ == "__main__":
    ingest()