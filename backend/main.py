import os
from dotenv import load_dotenv
# Explicitly load .env from the parent directory
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"), override=True)

from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
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
            session_id VARCHAR(36),
            query TEXT NOT NULL,
            answer TEXT,
            sources TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_session_id ON search_history(session_id);")
    # 3. Feedback table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id SERIAL PRIMARY KEY,
            query TEXT,
            answer TEXT,
            vote SMALLINT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # 4. Migration for existing tables
    try:
        cur.execute("ALTER TABLE search_history ADD COLUMN IF NOT EXISTS answer TEXT")
        cur.execute("ALTER TABLE search_history ADD COLUMN IF NOT EXISTS sources TEXT")
        cur.execute("ALTER TABLE search_history ADD COLUMN IF NOT EXISTS session_id VARCHAR(36)")
        cur.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT")
        cur.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS entities TEXT")
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

import asyncio
import threading

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

def log_to_history(query, answer="", sources=None, session_id=None):
    """Helper to log interactions to the PostgreSQL history table."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO search_history (query, answer, sources, session_id) VALUES (%s, %s, %s, %s)", 
            (query, answer, json.dumps(sources) if sources else "[]", session_id)
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

import re as _re

CLAUSE_TYPES = [
    "Payment Terms", "Termination for Convenience", "Termination for Cause",
    "Indemnification", "Limitation of Liability", "Auto-Renewal",
    "Confidentiality / NDA", "Force Majeure", "Governing Law",
    "Dispute Resolution", "Intellectual Property", "Non-Compete", "Warranties",
]

def _extract_json_object(raw: str) -> str:
    raw = _re.sub(r'```(?:json)?\s*', '', raw).strip().rstrip('`').strip()
    m = _re.search(r'\{[\s\S]*\}', raw)
    return m.group() if m else None

def _extract_json_array(raw: str) -> str:
    raw = _re.sub(r'```(?:json)?\s*', '', raw).strip().rstrip('`').strip()
    m = _re.search(r'\[[\s\S]*\]', raw)
    return m.group() if m else None

def generate_summary(text: str) -> str:
    """Returns a structured JSON summary of the document."""
    fallback = json.dumps({"overview": "Summary not available.", "parties": [], "key_dates": [], "obligations": [], "risk_flags": []})
    try:
        prompt = f"""Analyze this legal/business document and return a JSON object with EXACTLY these keys:
{{
  "overview": "2-3 sentence description of the document purpose",
  "parties": ["Name (Role)", "Name (Role)"],
  "key_dates": [{{"label": "Effective Date", "value": "..."}}],
  "obligations": ["Key obligation 1", "Key obligation 2"],
  "risk_flags": ["Notable risk or important clause"]
}}
Return ONLY valid JSON. No markdown code blocks.

Document:
{text[:4000]}"""
        raw = llm.invoke(prompt).content.strip()
        extracted = _extract_json_object(raw)
        if extracted:
            json.loads(extracted)
            return extracted
        return fallback
    except Exception as e:
        print(f"Summarization error: {e}")
        return fallback

def generate_clauses(text: str) -> str:
    """Identifies clause types present in the document. Returns JSON array."""
    try:
        prompt = f"""Analyze this legal document and identify which clause types are present.
Return a JSON array (present clauses only):
[
  {{"type": "Payment Terms", "excerpt": "short verbatim quote max 120 chars"}},
  ...
]
Choose types ONLY from: {', '.join(CLAUSE_TYPES)}
Return ONLY a valid JSON array. No markdown.

Document:
{text[:5000]}"""
        raw = llm.invoke(prompt).content.strip()
        extracted = _extract_json_array(raw)
        if extracted:
            json.loads(extracted)
            return extracted
        return "[]"
    except Exception as e:
        print(f"Clause extraction error: {e}")
        return "[]"

def generate_entities(text: str) -> str:
    """Extracts named entities from the document. Returns JSON object."""
    fallback = json.dumps({"parties": [], "amounts": [], "dates": [], "deadlines": []})
    try:
        prompt = f"""Extract named entities from this legal document.
Return a JSON object with EXACTLY these keys:
{{
  "parties": [{{"name": "Company/Person", "role": "Client/Provider/etc"}}],
  "amounts": [{{"value": "$50,000", "context": "annual fee"}}],
  "dates": [{{"value": "January 1 2024", "context": "effective date"}}],
  "deadlines": [{{"value": "30 days", "context": "termination notice"}}]
}}
Max 6 items per list. Return ONLY valid JSON. No markdown.

Document:
{text[:4000]}"""
        raw = llm.invoke(prompt).content.strip()
        extracted = _extract_json_object(raw)
        if extracted:
            json.loads(extracted)
            return extracted
        return fallback
    except Exception as e:
        print(f"Entity extraction error: {e}")
        return fallback

def _background_enrich(filename: str, full_text: str):
    """Run summary/entities/clauses extraction in a background thread after upload."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        summary_json   = generate_summary(full_text[:4000])
        entities_json  = generate_entities(full_text[:4000])
        clauses_json   = generate_clauses(full_text[:5000])

        cur.execute(
            "UPDATE documents SET summary=%s, entities=%s, tags=%s WHERE filename=%s",
            (summary_json, entities_json, clauses_json, filename)
        )
        conn.commit()
        cur.close()
        conn.close()
        print(f"[ENRICH] Completed background analysis for {filename}")
    except Exception as e:
        print(f"[ENRICH] Error enriching {filename}: {e}")

# ------------------ QUERY INTELLIGENCE ------------------

_DATE_AMT_PATTERN = _re.compile(
    r'\b(date|dates|when|period|duration|term\b|start\s+date|end\s+date|expire|expiry|'
    r'expiration|effective\s+date|valid(ity)?|from\s+\w+\s+to|from\s+which|schedule|timeline|deadline|'
    r'payment|pay(ment)?|amount|fee|fees|cost|price|rate|monthly|annual|yearly|'
    r'quarterly|due\s+date|invoice|billing|charge|charges|total|how\s+much|how\s+long|'
    r'renewal|renew|notice\s+period|days|months|years|since|between)\b',
    _re.IGNORECASE
)

_OBLIGATION_PATTERN = _re.compile(
    r'\b(obligation|obligations|duty|duties|responsible|responsibility|must\b|required\s+to|'
    r'have\s+to|need\s+to|shall\b|vendor|client|party|parties|deliverable|deliverables|'
    r'comply|compliance|what\s+does|what\s+must|what\s+should|who\s+is\s+responsible|'
    r'service\s+provider|customer|contractor|supplier|licensee|licensor)\b',
    _re.IGNORECASE
)

_RISK_PATTERN = _re.compile(
    r'\b(risk|risks|risky|one.sided|unfair|red.flag|red\s+flags|problematic|concern|concerns|'
    r'liability|exposure|dangerous|harsh|penalty\b|unilateral|unreasonable|clause\b|clauses\b|'
    r'loophole|trap|issue|issues|review|audit|flag|flags|protect|protection|warning)\b',
    _re.IGNORECASE
)

def is_date_amount_query(q: str) -> bool:
    return bool(_DATE_AMT_PATTERN.search(q))

def is_obligation_query(q: str) -> bool:
    return bool(_OBLIGATION_PATTERN.search(q)) and not is_date_amount_query(q)

def is_risk_query(q: str) -> bool:
    return bool(_RISK_PATTERN.search(q)) and not is_date_amount_query(q) and not is_obligation_query(q)

_DATE_AMT_PROMPT_EXTRA = """
7. OUTPUT FORMAT (strictly follow this — no bullet points, no prose for data):
   Start your answer with a markdown table using EXACTLY these columns:
   | Document | Field | Value | Notes |
   |----------|-------|-------|-------|
   Fill one row per date/amount/period found. Examples of rows:
   | saas-agreement.pdf | Start Date | 1 January 2023 | Effective date |
   | saas-agreement.pdf | End Date | 31 December 2025 | Auto-renews unless terminated |
   | saas-agreement.pdf | Monthly Fee | $5,000 | Payable on the 1st |
   If a value is not in the excerpts, write "Not specified" — never guess.
   After the table, write 2 sentences maximum summarising the key dates/amounts.
"""

_OBLIGATION_PROMPT_EXTRA = """
7. OUTPUT FORMAT (strictly follow this — no bullet points, no prose for data):
   Start your answer with a markdown table using EXACTLY these columns:
   | Party | Obligation | Deadline / Condition |
   |-------|-----------|----------------------|
   Fill one row per obligation found. Use party names exactly as in the document.
   If no deadline is stated write "Not specified".
   After the table, write 2 sentences maximum summarising the key obligations.
"""

_RISK_PROMPT_EXTRA = """
7. OUTPUT FORMAT (strictly follow this — no bullet points, no prose for data):
   Start your answer with a markdown table using EXACTLY these columns:
   | Clause / Section | Risk Level | Concern |
   |-----------------|------------|---------|
   Risk levels must be: High / Medium / Low only.
   Only include clauses that are genuinely one-sided, unusual, or harmful.
   Cite source documents using [1], [2] etc. in the Concern column.
   After the table, write 2 sentences maximum summarising the top risks.
"""

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

    # 5. Fire background enrichment (summary + entities + clauses)
    threading.Thread(
        target=_background_enrich,
        args=(file.filename, full_text),
        daemon=True
    ).start()

    # 6. Search
    results = db.similarity_search_with_score(full_text[:5000], k=15)
    formatted = format_search_results(results)

    log_to_history(
        query=f"Uploaded: {file.filename}",
        answer=f"I have successfully indexed and analyzed **{file.filename}**.",
        sources=formatted.get("results", []),
        session_id=None # Uploads don't necessarily belong to a session, or we could pass one
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

class ConversationMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class SearchQuery(BaseModel):
    query: str
    focused_document: str | None = None
    session_id: str | None = None
    conversation_history: list[ConversationMessage] = []

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
        sources=formatted.get("results", []),
        session_id=search.session_id
    )
    
    return formatted

# ------------------ CHAT / RAG API ------------------

@app.post("/chat")
async def chat_with_docs(search: SearchQuery):
    if not db:
        return {"answer": "I'm still loading my knowledge base. Please try again in a few moments.", "sources": []}

    # 1. Retrieve more chunks (k=12) and filter out very low similarity results
    results_with_scores = db.similarity_search_with_score(search.query, k=12)

    # Filter: keep only chunks with cosine similarity > 15% (score < 0.85)
    # Cosine distance: 0 = identical, 1 = orthogonal, 2 = opposite
    relevant_results = [r for r, score in results_with_scores if score < 0.85]

    # Fall back to top 4 if nothing passes the threshold
    if not relevant_results:
        relevant_results = [r for r, _ in results_with_scores[:4]]

    sources = list(set([r.metadata.get("source") for r in relevant_results]))

    if relevant_results:
        context = "\n\n---\n\n".join([
            f"[Source: {r.metadata.get('source', 'Unknown')}, Page {r.metadata.get('page', '?')}]\n{r.page_content}"
            for r in relevant_results
        ])
        prompt = f"""You are a contract and legal document assistant. Answer questions based on the document excerpts provided.

DOCUMENT EXCERPTS:
{context}

---

USER QUESTION: {search.query}

INSTRUCTIONS:
1. Answer using ONLY information from the DOCUMENT EXCERPTS above.
2. If the exact phrase isn't used, look for equivalent legal meaning. For example:
   - "terminate without cause" = "termination for convenience" = "either party may terminate with notice"
   - "auto-renewal" = "automatically renews" = "successive terms"
   - "liability cap" = "maximum liability" = "aggregate liability shall not exceed"
3. When answering, cite the specific document name and page number.
4. If truly no relevant information exists in any excerpt, say: "I could not find this information in the uploaded documents."
5. Be concise and professional.

Answer:"""
    else:
        prompt = f"""You are a Document Assistant. The user's document library does not contain relevant content for this query.

User's Question: {search.query}

State clearly that no relevant information was found. Do NOT use general knowledge.

Answer:"""

    try:
        response = llm.invoke(prompt)
        answer_text = response.content.strip()

        # Build citation cards from the exact chunks used to generate the answer
        score_map = {id(r): score for r, score in results_with_scores}
        grouped = {}
        for r, score in results_with_scores:
            if r not in relevant_results:
                continue
            similarity = round(max(0.0, (1 - score) * 100), 2)
            fname = r.metadata.get("source", "Unknown")
            page  = r.metadata.get("page", 1)
            if fname not in grouped:
                grouped[fname] = {
                    "file": fname,
                    "similarity": similarity,
                    "text": r.page_content[:200],
                    "full_text": r.page_content[:3000],
                    "matching_pages": [page],
                }
            else:
                if page not in grouped[fname]["matching_pages"]:
                    grouped[fname]["matching_pages"].append(page)
                if similarity > grouped[fname]["similarity"]:
                    grouped[fname]["similarity"] = similarity
                    grouped[fname]["text"] = r.page_content[:200]
                    grouped[fname]["full_text"] = r.page_content[:3000]

        citation_results = sorted(grouped.values(), key=lambda x: x["similarity"], reverse=True)

        # Log to history
        log_to_history(query=search.query, answer=answer_text, sources=sources, session_id=search.session_id)

        return {
            "answer": answer_text,
            "sources": sources,
            "results": citation_results,
        }
    except Exception as e:
        print(f"Chat error: {e}")
        return {"error": str(e), "answer": f"Failed to generate answer: {str(e)}"}

# ------------------ STREAMING CHAT API ------------------

@app.post("/chat-stream")
async def chat_stream(search: SearchQuery):
    if not db:
        async def error_gen():
            yield "data: \"I'm still loading my knowledge base. Please wait a moment.\"\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(error_gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    # 1. Classify query type
    date_amt_query   = is_date_amount_query(search.query)
    obligation_query = is_obligation_query(search.query)
    risk_query       = is_risk_query(search.query)
    structured_query = date_amt_query or obligation_query or risk_query
    print(f"[QUERY TYPE] date={date_amt_query} obligation={obligation_query} risk={risk_query} query={search.query!r}")

    # Build augmented retrieval query (blend current + recent history for better recall)
    retrieval_query = search.query
    if search.conversation_history:
        recent = [m.content for m in search.conversation_history[-4:] if m.role == "user"]
        if recent:
            retrieval_query = search.query + " " + " ".join(recent[-2:])

    k_val = 25 if structured_query else 15
    score_threshold = 0.92 if structured_query else 0.88

    if search.focused_document:
        results_with_scores = db.similarity_search_with_score(
            retrieval_query, k=k_val,
            filter={"source": search.focused_document}
        )
    else:
        results_with_scores = db.similarity_search_with_score(retrieval_query, k=k_val)
    relevant_results = [r for r, score in results_with_scores if score < score_threshold]
    if not relevant_results:
        relevant_results = [r for r, _ in results_with_scores[:5]]

    sources = list(set([r.metadata.get("source") for r in relevant_results]))

    # 2. Build citation cards
    grouped = {}
    for r, score in results_with_scores:
        if r not in relevant_results:
            continue
        similarity = round(max(0.0, (1 - score) * 100), 2)
        fname = r.metadata.get("source", "Unknown")
        page  = r.metadata.get("page", 1)
        if fname not in grouped:
            grouped[fname] = {
                "file": fname, "similarity": similarity,
                "text": r.page_content[:200], "full_text": r.page_content[:3000],
                "matching_pages": [page],
            }
        else:
            if page not in grouped[fname]["matching_pages"]:
                grouped[fname]["matching_pages"].append(page)
            if similarity > grouped[fname]["similarity"]:
                grouped[fname]["similarity"] = similarity
                grouped[fname]["text"] = r.page_content[:200]
                grouped[fname]["full_text"] = r.page_content[:3000]

    citation_results = sorted(grouped.values(), key=lambda x: x["similarity"], reverse=True)

    # 3. Build numbered source list for citations
    source_list = "\n".join([
        f"[{i+1}] {cr['file']} (Page {cr['matching_pages'][0] if cr['matching_pages'] else '?'})"
        for i, cr in enumerate(citation_results)
    ])

    # 4. Build prompt with citation instructions
    chunk_size = 1200 if structured_query else 800

    if relevant_results:
        context_parts = []
        seen_sources = set()
        for i, cr in enumerate(citation_results):
            # For structured queries include multiple chunks per source for completeness
            if structured_query:
                source_chunks = [
                    (r, score) for r, score in results_with_scores
                    if r.metadata.get("source") == cr["file"] and r in relevant_results
                ]
                for r, _ in source_chunks[:3]:
                    chunk_key = (cr["file"], r.metadata.get("page","?"))
                    if chunk_key not in seen_sources:
                        seen_sources.add(chunk_key)
                        context_parts.append(
                            f"[{i+1}] Source: {cr['file']}, Page {r.metadata.get('page','?')}\n{r.page_content[:chunk_size]}"
                        )
            else:
                for r, score in results_with_scores:
                    if r.metadata.get("source") == cr["file"] and r in relevant_results:
                        context_parts.append(
                            f"[{i+1}] Source: {cr['file']}, Page {r.metadata.get('page','?')}\n{r.page_content[:chunk_size]}"
                        )
                        break
        context = "\n\n---\n\n".join(context_parts)

        focus_note = f"\nNOTE: The user is asking specifically about '{search.focused_document}'. Answer only from that document's content.\n" if search.focused_document else ""

        if date_amt_query:
            special_note = _DATE_AMT_PROMPT_EXTRA
        elif obligation_query:
            special_note = _OBLIGATION_PROMPT_EXTRA
        elif risk_query:
            special_note = _RISK_PROMPT_EXTRA
        else:
            special_note = ""

        # Build conversation history block
        history_block = ""
        if search.conversation_history:
            history_lines = []
            for m in search.conversation_history[-6:]:  # last 3 exchanges
                role_label = "User" if m.role == "user" else "Assistant"
                history_lines.append(f"{role_label}: {m.content[:400]}")
            history_block = "\nCONVERSATION HISTORY (for context):\n" + "\n".join(history_lines) + "\n"

        format_instruction = (
            "6. Be concise and professional. Use markdown formatting (**bold** for key terms, bullet points for lists)."
            if not special_note else
            "6. Be concise and professional. Use **bold** for key terms. Do NOT use bullet points — follow the table format in instruction 7 instead."
        )

        prompt = f"""You are a contract and legal document assistant. Answer questions based on the document excerpts provided.{focus_note}{history_block}

AVAILABLE SOURCES:
{source_list}

DOCUMENT EXCERPTS:
{context}

---

USER QUESTION: {search.query}

INSTRUCTIONS:
1. Answer using ONLY information from the DOCUMENT EXCERPTS above.
2. Use inline citations like [1], [2] when referencing specific sources.
3. Consider the CONVERSATION HISTORY to understand what the user is referring to (e.g. "it", "that", "the agreement mentioned").
4. If the exact phrase isn't used, look for equivalent legal meaning (e.g. "terminate without cause" = "termination for convenience", "penalty for late payment" = "interest on overdue amounts").
5. IMPORTANT: If the document excerpts contain ANY relevant information even partially, use it to answer. Only say "I could not find this information" if the excerpts are truly unrelated.
{format_instruction}
{special_note}
Answer:"""
    else:
        prompt = f"""You are a Document Assistant. The user's document library does not contain relevant content for this query.
User's Question: {search.query}
State clearly that no relevant information was found. Do NOT use general knowledge.
Answer:"""

    async def generate():
        # Send citation cards first
        yield f"event: sources\ndata: {json.dumps(citation_results)}\n\n"

        full_answer = ""
        try:
            async for chunk in llm.astream(prompt):
                token = chunk.content
                if token:
                    full_answer += token
                    yield f"data: {json.dumps(token)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps(f'Error generating response: {str(e)}')}\n\n"

        yield "data: [DONE]\n\n"

        # Log to history after streaming completes
        log_to_history(query=search.query, answer=full_answer, sources=sources, session_id=search.session_id)

        # Generate follow-up questions
        try:
            followup_prompt = f"""A user asked: "{search.query}"
The assistant answered from legal/contract documents.
Generate exactly 3 short, specific follow-up questions the user might ask next.
Return ONLY a valid JSON array of 3 strings, e.g. ["Q1?", "Q2?", "Q3?"]
No explanation, no markdown, just the JSON array."""
            followup_response = await llm.ainvoke(followup_prompt)
            raw = followup_response.content.strip()
            # Extract JSON array robustly
            import re as _re
            match = _re.search(r'\[.*?\]', raw, _re.DOTALL)
            if match:
                followups = json.loads(match.group())
                if isinstance(followups, list) and len(followups) > 0:
                    yield f"event: followups\ndata: {json.dumps(followups[:3])}\n\n"
        except Exception as e:
            print(f"Follow-up generation error: {e}")

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

# ------------------ SUMMARIZE API ------------------

@app.get("/summarize/{filename}")
async def summarize_document(filename: str):
    try:
        import urllib.parse
        filename = urllib.parse.unquote(filename)
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT summary, entities FROM documents WHERE filename = %s", (filename,))
        row = cur.fetchone()

        structured = None
        entities = None

        if row and row['summary']:
            try:
                structured = json.loads(row['summary'])
            except Exception:
                structured = None  # old plain-text format — regenerate

        if row and row.get('entities'):
            try:
                entities = json.loads(row['entities'])
            except Exception:
                entities = None

        if structured is None or entities is None:
            file_path = os.path.join(DOCS_PATH, filename)
            if not os.path.exists(file_path):
                return {"error": "File not found"}
            doc = fitz.open(file_path)
            text = "".join(doc[i].get_text() for i in range(min(5, len(doc))))

            if structured is None:
                summary_json = generate_summary(text)
                cur.execute("UPDATE documents SET summary = %s WHERE filename = %s", (summary_json, filename))
                structured = json.loads(summary_json)

            if entities is None:
                entities_json = generate_entities(text)
                cur.execute("UPDATE documents SET entities = %s WHERE filename = %s", (entities_json, filename))
                entities = json.loads(entities_json)

            conn.commit()

        cur.close()
        conn.close()
        return {"structured": structured, "entities": entities}
    except Exception as e:
        return {"error": str(e)}

@app.get("/clauses/{filename}")
async def get_clauses(filename: str):
    try:
        import urllib.parse
        filename = urllib.parse.unquote(filename)
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT tags FROM documents WHERE filename = %s", (filename,))
        row = cur.fetchone()

        if row and row['tags']:
            return {"clauses": json.loads(row['tags'])}

        file_path = os.path.join(DOCS_PATH, filename)
        if not os.path.exists(file_path):
            return {"error": "File not found", "clauses": []}

        doc = fitz.open(file_path)
        text = "".join(doc[i].get_text() for i in range(min(8, len(doc))))
        tags_json = generate_clauses(text)

        cur.execute("UPDATE documents SET tags = %s WHERE filename = %s", (tags_json, filename))
        conn.commit()
        cur.close()
        conn.close()
        return {"clauses": json.loads(tags_json)}
    except Exception as e:
        return {"error": str(e), "clauses": []}

# ------------------ HISTORY API ------------------

@app.get("/history")
async def get_history():
    """Returns a list of unique sessions with their most recent query."""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        # Group by session_id and get the latest query for each session
        cur.execute("""
            SELECT DISTINCT ON (COALESCE(session_id, 'legacy-' || id::text))
                id, 
                query, 
                answer, 
                sources, 
                timestamp, 
                COALESCE(session_id, 'legacy-' || id::text) as session_id
            FROM search_history 
            ORDER BY COALESCE(session_id, 'legacy-' || id::text), timestamp DESC 
            LIMIT 50
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        # Sort by timestamp descending
        rows.sort(key=lambda x: x['timestamp'], reverse=True)
        return rows
    except Exception as e:
        print(f"History fetch error: {e}")
        return []

@app.get("/history/session/{session_id}")
async def get_session_history(session_id: str):
    """Returns all messages for a specific session."""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        if session_id.startswith("legacy-"):
            # If it's a legacy item, return the original record PLUS any continuations
            legacy_id = session_id.split("-")[1]
            cur.execute("""
                SELECT query, answer, sources, timestamp 
                FROM search_history 
                WHERE id = %s OR session_id = %s 
                ORDER BY timestamp ASC
            """, (legacy_id, session_id))
        else:
            cur.execute("""
                SELECT query, answer, sources, timestamp 
                FROM search_history 
                WHERE session_id = %s 
                ORDER BY timestamp ASC
            """, (session_id,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        print(f"Session history fetch error: {e}")
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

# ------------------ DOCUMENT PAGE SEARCH ------------------

@app.get("/document-pages/{filename}")
async def get_document_pages(filename: str, query: str = ""):
    """Search within a specific document to find ALL pages matching the query."""
    if not db:
        return {"pages": []}
    try:
        import urllib.parse
        filename = urllib.parse.unquote(filename)

        if not query:
            return {"pages": []}

        # Broad search then filter client-side to this document (avoids Chroma filter syntax issues)
        results = db.similarity_search_with_score(query, k=100)

        seen_pages = {}
        for r, score in results:
            src = r.metadata.get("source", "")
            if src != filename:
                continue
            page = r.metadata.get("page", 1)
            similarity = round(max(0.0, (1 - score) * 100), 2)
            if page not in seen_pages or similarity > seen_pages[page]["similarity"]:
                seen_pages[page] = {
                    "page": page,
                    "similarity": similarity,
                    "text": r.page_content[:300],
                }

        # Return all found pages sorted by relevance (no minimum threshold)
        matching = sorted(
            seen_pages.values(),
            key=lambda x: x["similarity"],
            reverse=True,
        )

        return {"pages": list(matching), "total_indexed": len(seen_pages)}
    except Exception as e:
        print(f"Document page search error: {e}")
        return {"pages": []}


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
        cur.execute("SELECT id, filename, file_size, upload_time, category, tags FROM documents ORDER BY upload_time DESC")
        docs = cur.fetchall()
        cur.close()
        conn.close()
        for doc in docs:
            if doc['upload_time']:
                doc['upload_time'] = doc['upload_time'].isoformat()
            if doc.get('tags'):
                try:
                    doc['tags'] = json.loads(doc['tags'])
                except Exception:
                    doc['tags'] = []
            else:
                doc['tags'] = []
        return docs
    except Exception as e:
        print(f"Error fetching documents list: {e}")
        return []

# ------------------ FEEDBACK API ------------------

class FeedbackBody(BaseModel):
    query: str
    answer: str
    vote: int   # 1 = thumbs up, -1 = thumbs down

@app.post("/feedback")
async def submit_feedback(body: FeedbackBody):
    if body.vote not in (1, -1):
        return {"status": "error", "message": "vote must be 1 or -1"}
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO feedback (query, answer, vote) VALUES (%s, %s, %s)",
            (body.query, body.answer[:2000], body.vote)
        )
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        print(f"Feedback error: {e}")
        return {"status": "error", "message": str(e)}