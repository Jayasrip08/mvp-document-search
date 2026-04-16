import os
from dotenv import load_dotenv
# Load environment variables (from .env locally, or from environment in production)
load_dotenv()

from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
import fitz
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel
import shutil
import json
import asyncio

# ------------------ DATABASE ------------------

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    # 1. Documents table with AI metadata
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id SERIAL PRIMARY KEY,
            filename VARCHAR NOT NULL,
            file_path VARCHAR NOT NULL,
            file_size INTEGER NOT NULL,
            upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            category VARCHAR DEFAULT 'Unclassified',
            summary TEXT
        );
    """)
    # 2. Search history table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS search_history (
            id SERIAL PRIMARY KEY,
            query TEXT NOT NULL,
            answer TEXT,
            sources TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # 3. Migration for existing tables
    try:
        cur.execute("ALTER TABLE search_history ADD COLUMN IF NOT EXISTS answer TEXT")
        cur.execute("ALTER TABLE search_history ADD COLUMN IF NOT EXISTS sources TEXT")
    except Exception as e:
        print(f"Migration note: {e}")
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

@app.get("/healthz")
async def health_check():
    return {"status": "ok"}

# ------------------ EMBEDDINGS + CHROMA (LAZY LOADED) ------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROMA_PATH = os.path.join(BASE_DIR, "db")
DOCS_PATH = os.path.join(BASE_DIR, "documents")

embeddings = None
db = None

# ------------------ LOCAL LLM (PHI-3) ------------------

llm = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini"),
    temperature=0,
    api_key=os.getenv("OPENAI_API_KEY")
)

# ------------------ LOAD DOCUMENTS ------------------

def load_documents_to_db():
    if not os.path.exists(DOCS_PATH):
        os.makedirs(DOCS_PATH, exist_ok=True)
        return

    conn = get_db_connection()
    cur = conn.cursor()

    for file in os.listdir(DOCS_PATH):
        if not file.endswith(".pdf"):
            continue

        file_path = os.path.join(DOCS_PATH, file)

        # 1. Sync with Postgres (ensure metadata exists)
        cur.execute("SELECT id FROM documents WHERE filename = %s", (file,))
        if not cur.fetchone():
            file_size = os.path.getsize(file_path)
            cur.execute(
                "INSERT INTO documents (filename, file_path, file_size, category) VALUES (%s, %s, %s, %s)",
                (file, file_path, file_size, "Unclassified")
            )
            conn.commit()

        # 2. Sync with ChromaDB
        try:
            # Check if file is already in Chroma by querying metadatas
            existing = db.get(where={"source": file})
            if not existing or not existing['ids']:
                print(f"[INIT] Indexing: {file}...")
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

# 🔥 Load documents on startup (Non-blocking)
@app.on_event("startup")
async def startup_event():
    # Run heavy indexing in the background
    asyncio.create_task(async_load_documents())

async def async_load_documents():
    global embeddings, db
    print("[INIT] Starting background model & document indexing...")
    try:
        # Load Embeddings & Chroma in a thread to prevent blocking
        def load_models():
            global embeddings, db
            print("[INIT] Loading HuggingFace Embeddings Model...")
            embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
            print("[INIT] Connecting to ChromaDB...")
            db = Chroma(
                persist_directory=CHROMA_PATH,
                embedding_function=embeddings,
                collection_metadata={"hnsw:space": "cosine"}
            )
            print(f"[INIT] Starting Document Sync for {len([f for f in os.listdir(DOCS_PATH) if f.endswith('.pdf')])} files...")
            load_documents_to_db()

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, load_models)
        print("[INIT] Background initialization complete.")
    except Exception as e:
        print(f"[ERROR] Background initialization failed: {e}")

# ------------------ HELPERS ------------------

def log_to_history(query, answer="", sources=None):
    """Helper to log interactions to the PostgreSQL history table."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO search_history (query, answer, sources) VALUES (%s, %s, %s)", 
            (query, answer, json.dumps(sources) if sources else "[]")
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"History log error: {e}")

def classify_document(text_preview: str):
    """Uses GPT to categorize the document."""
    try:
        prompt = f"""Analyze the following text from a document and classify it into ONE of these categories:
NDA, Service Agreement, Maintenance Contract, Employment Agreement, Lease, or Other.
Return ONLY the category name, nothing else.

Text: {text_preview[:1500]}"""
        response = llm.invoke(prompt)
        category = response.content.strip()
        valid_tags = ["NDA", "Service Agreement", "Maintenance Contract", "Employment Agreement", "Lease", "Other"]
        for tag in valid_tags:
            if tag.lower() in category.lower():
                return tag
        return "Other"
    except Exception as e:
        print(f"Classification timeout or error: {e}")
        return "Unclassified"

def generate_summary(text: str):
    """Generates a 5-line summary using GPT."""
    try:
        prompt = f"""Summarize the following document in exactly 5 concise bullet points.
Focus on: main purpose, parties involved, key obligations, payment/termination terms, and any notable clauses.
Use clear, professional language.

Text: {text[:4000]}"""
        response = llm.invoke(prompt)
        return response.content.strip()
    except Exception as e:
        print(f"Summarization error: {e}")
        return "Summary not available."

# ------------------ PDF TEXT EXTRACT ------------------

def extract_text(file):
    pdf = fitz.open(stream=file.file.read(), filetype="pdf")
    text = ""
    for page in pdf:
        text += page.get_text()
    return text

@app.post("/search")
async def search(file: UploadFile):
    if not db:
        return {"error": "System is still initializing. Please wait about 30 seconds and try again.", "results": [], "count": 0}
    
    # 1. Save file to disk
    os.makedirs(DOCS_PATH, exist_ok=True)
    file_path = os.path.join(DOCS_PATH, file.filename)
    
    file_content = await file.read()
    with open(file_path, "wb") as f:
        f.write(file_content)
    
    file_size = len(file_content)

    # 2. Update PostgreSQL with Classification
    # Extract first page for classification
    pdf = fitz.open(stream=file_content, filetype="pdf")
    first_page_text = pdf[0].get_text() if len(pdf) > 0 else ""
    category = classify_document(first_page_text)

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM documents WHERE filename = %s", (file.filename,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO documents (filename, file_path, file_size, category) VALUES (%s, %s, %s, %s)",
            (file.filename, file_path, file_size, category)
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
    formatted = format_search_results(results)
    
    # Log to history
    log_to_history(
        query=f"Uploaded: {file.filename}", 
        answer=f"I have successfully indexed and analyzed **{file.filename}**.", 
        sources=formatted.get("results", [])
    )
    
    return formatted

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
    if not db:
        return {"error": "Search engine is initializing...", "results": [], "count": 0}

    results = db.similarity_search_with_score(search.query, k=15)
    formatted = format_search_results(results)
    
    # Log to history
    log_to_history(
        query=search.query, 
        answer=f"I found {formatted.get('count', 0)} relevant snippets for your query.", 
        sources=formatted.get("results", [])
    )
    
    return formatted

# ------------------ CHAT / RAG API ------------------

@app.post("/chat")
async def chat_with_docs(search: SearchQuery):
    if not db:
        return {"answer": "I'm still loading my knowledge base. Please try again in a few moments.", "sources": []}

    # 1. Retrieve relevant context from vector DB
    results = db.similarity_search(search.query, k=6)
    sources = list(set([r.metadata.get("source") for r in results]))

    if results:
        context = "\n\n---\n\n".join([
            f"[Source: {r.metadata.get('source', 'Unknown')}, Page {r.metadata.get('page', '?')}]\n{r.page_content}"
            for r in results
        ])
        prompt = f"""You are a strict Document Assistant. Your primary goal is to provide answers based ONLY on the document excerpts provided below.

DOCUMENT EXCERPTS:
{context}

---

USER QUESTION: {search.query}

STRICT INSTRUCTIONS:
1. Answer the question using ONLY the information found in the DOCUMENT EXCERPTS above.
2. If the answer is not contained within the excerpts, explicitly state: "I'm sorry, but I could not find information regarding this in the uploaded documents." Do NOT use your general knowledge to answer.
3. Be professional and cite the specific document/page when possible.
4. If the question is greeting or not a query (e.g., "Hello"), you may respond politely but remind the user you are here to help with their documents.

Answer:"""
    else:
        # No relevant documents found
        prompt = f"""You are a Document Assistant. The user's document library does not contain any relevant content for this query.

User's Question: {search.query}

Response: State clearly that no relevant information was found in the uploaded documents. Do NOT provide an answer from your general knowledge.

Answer:"""

    try:
        response = llm.invoke(prompt)
        answer_text = response.content.strip()
        
        # Log to history
        log_to_history(query=search.query, answer=answer_text, sources=sources)

        return {
            "answer": answer_text,
            "sources": sources
        }
    except Exception as e:
        print(f"Chat error: {e}")
        return {"error": str(e), "answer": f"Failed to generate answer: {str(e)}"}

# ------------------ SUMMARIZE API ------------------

@app.get("/summarize/{filename}")
async def summarize_document(filename: str):
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT summary, id FROM documents WHERE filename = %s", (filename,))
        row = cur.fetchone()
        
        if row and row['summary']:
            return {"summary": row['summary']}

        # If no summary, generate it
        file_path = os.path.join(DOCS_PATH, filename)
        if not os.path.exists(file_path):
            return {"error": "File not found"}
        
        doc = fitz.open(file_path)
        text = ""
        for i in range(min(5, len(doc))): # Sumarize from first 5 pages
            text += doc[i].get_text()
        
        summary = generate_summary(text)
        
        # Save to DB
        cur.execute("UPDATE documents SET summary = %s WHERE filename = %s", (summary, filename))
        conn.commit()
        cur.close()
        conn.close()
        
        return {"summary": summary}
    except Exception as e:
        return {"error": str(e)}

# ------------------ HISTORY API ------------------

@app.get("/history")
async def get_history():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, query, answer, sources, timestamp FROM search_history ORDER BY timestamp DESC LIMIT 20")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        print(f"History fetch error: {e}")
        return []

@app.delete("/history/{item_id}")
async def delete_history_item(item_id: int):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM search_history WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

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
    if not db:
        return {"document_count": 0, "status": "Initializing AI models..."}

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
        # Explicitly set media type and headers to ensure inline viewing
        headers = {
            "Content-Disposition": f'inline; filename="{filename}"'
        }
        return FileResponse(file_path, media_type="application/pdf", headers=headers)
    return {"error": "File not found"}

# ------------------ LIST DOCUMENTS API ------------------

@app.get("/documents")
async def get_documents():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, filename, file_size, upload_time, category FROM documents ORDER BY upload_time DESC")
        docs = cur.fetchall()
        cur.close()
        conn.close()
        # Ensure datetimes are serialized to strings
        for doc in docs:
            if doc['upload_time']:
                doc['upload_time'] = doc['upload_time'].isoformat()
        return docs
    except Exception as e:
        print(f"Error fetching documents list: {e}")
        return []