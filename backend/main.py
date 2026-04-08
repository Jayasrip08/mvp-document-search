from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
import fitz
import os
from sqlalchemy.orm import Session

# Import database session and models
from database import engine, get_db, Base
import models

# Create Postgres tables if they don't exist
Base.metadata.create_all(bind=engine)

app = FastAPI()

# ✅ Enable CORS (important for React)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Load embeddings + DB
embeddings = OpenAIEmbeddings()
db = Chroma(persist_directory="../db", embedding_function=embeddings)


# ✅ Extract text from uploaded PDF
def extract_text(file):
    pdf = fitz.open(stream=file.file.read(), filetype="pdf")
    text = ""
    for page in pdf:
        text += page.get_text()
    return text


# ✅ SEARCH API (with similarity %)
@app.post("/search")
async def search(file: UploadFile, db_session: Session = Depends(get_db)):
    text = extract_text(file)

    results = db.similarity_search_with_score(text, k=4)

    output = []

    for r, score in results:
        similarity = round((1 - score) * 100, 2)
        
        # We fetch the exact Document Metadata from our PostgreSQL database using the postgres_id
        pg_id = r.metadata.get("postgres_id")
        file_name = r.metadata.get("source", "Unknown")
        
        if pg_id:
            pg_doc = db_session.query(models.DocumentMetadata).filter_by(id=pg_id).first()
            if pg_doc:
                # We can override or enrich data with postgres metadata
                file_name = pg_doc.filename

        output.append({
            "file": file_name,
            "text": r.page_content[:200],
            "similarity": similarity
        })

    return {
        "count": len(output),
        "results": output
    }


# ✅ VIEW / DOWNLOAD DOCUMENT
@app.get("/document/{filename}")
def get_document(filename: str):
    file_path = f"../documents/{filename}"

    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename)
    
    return {"error": "File not found"}