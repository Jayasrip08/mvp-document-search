import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";

/* ── helpers ─────────────────────────────────────── */
function getBadgeClass(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

const STOP_WORDS = new Set([
  "what","where","which","when","who","how","why","are","the","for","and",
  "that","this","with","from","have","has","had","been","will","would",
  "could","should","may","can","its","not","but","all","any","each","was",
  "were","they","their","them","than","then","does","did","into","onto",
  "upon","over","under","about","after","before","between","through","per",
  "our","your","his","her","its","we","you","he","she","it","is","in","on",
  "at","to","of","a","an","or","if","so","do","be","by","as","up","out",
  "off","down","use","used","also","such","other","these","those","shall",
]);

/* Injects <mark> tags into raw markdown text so ReactMarkdown renders highlights */
function markKeywords(markdown, query) {
  if (!query || !markdown) return markdown || "";
  const keywords = query.split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (keywords.length === 0) return markdown;
  const regex = new RegExp(`\\b(${keywords.join("|")})\\b`, "gi");
  return markdown.replace(regex, "<mark>$1</mark>");
}

function highlightText(text, query) {
  if (!query || !text) return text;

  const keywords = query.split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (keywords.length === 0) return text;

  const regex = new RegExp(`(${keywords.join("|")})`, "gi");
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) => {
        const isMatch = keywords.some(kw => new RegExp(`^${kw}$`, "i").test(part));
        return isMatch ? <mark key={i}>{part}</mark> : part;
      })}
    </span>
  );
}

/* ── Full-document Viewer Modal ─────────────────── */
function DocumentModal({ item, onClose, query }) {
  const [matchIndex, setMatchIndex] = useState(0);
  const [clauseCopied, setClauseCopied] = useState(false);
  const [allPages, setAllPages] = useState(item.matching_pages || []);
  const [loadingPages, setLoadingPages] = useState(true);
  const badgeClass = getBadgeClass(item.similarity);

  const API_URL = import.meta.env.VITE_API_URL || "/api";

  useEffect(() => {
    if (!query || !item.file) { setLoadingPages(false); return; }
    const encoded = encodeURIComponent(item.file);
    const q = encodeURIComponent(query);
    fetch(`${API_URL}/document-pages/${encoded}?query=${q}`)
      .then(r => r.json())
      .then(data => {
        if (data.pages && data.pages.length > 0) {
          setAllPages(data.pages.map(p => p.page));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPages(false));
  }, [item.file, query]);

  const totalMatches = allPages.length || 0;
  const currentPage = allPages[matchIndex] || 1;

  const searchTerms = (query || "")
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .slice(0, 3)
    .join(" ");
  const pdfUrl = `${API_URL}/document/${item.file}?v=${Date.now()}#page=${currentPage}${searchTerms ? `&search=${encodeURIComponent(searchTerms)}` : ""}`;

  const nextMatch = () => setMatchIndex(prev => (prev + 1) % totalMatches);
  const prevMatch = () => setMatchIndex(prev => (prev - 1 + totalMatches) % totalMatches);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && totalMatches > 1) nextMatch();
      if (e.key === "ArrowLeft" && totalMatches > 1) prevMatch();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [matchIndex, totalMatches]);

  const handleCopyClause = () => {
    const text = item.full_text || item.text || "";
    navigator.clipboard.writeText(`[${item.file} — Page ${currentPage}]\n\n${text}`);
    setClauseCopied(true);
    setTimeout(() => setClauseCopied(false), 2000);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className="modal-box">
        <div className="modal-header">
          <div className="modal-title-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div className="modal-title">
            <span className="modal-title-text">{item.file}</span>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0 }}>
            <span className={`match-badge ${badgeClass}`}>
              {item.similarity}% match
            </span>
            <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        <div className="modal-split-content">
          <div className="pdf-side">
            <iframe
              src={pdfUrl}
              className="pdf-iframe"
              title="PDF Viewer"
              key={`${item.file}-${currentPage}`}
            />
          </div>

          <div className="text-side">
            <div className="match-navigator-bar">
              <div>
                {loadingPages ? (
                  <div className="match-nav-label" style={{ opacity: 0.6 }}>Finding matching pages…</div>
                ) : (
                  <>
                    <div className="match-nav-label">Page {matchIndex + 1} of {totalMatches}</div>
                    {totalMatches > 1 && (
                      <div className="match-nav-hint">← → keys to navigate</div>
                    )}
                  </>
                )}
              </div>
              <div className="match-nav-btns">
                <button className="btn-nav" onClick={prevMatch} disabled={totalMatches <= 1 || loadingPages}>← Prev</button>
                <button className="btn-nav" onClick={nextMatch} disabled={totalMatches <= 1 || loadingPages}>Next →</button>
              </div>
            </div>

            <div style={{ padding: "20px 20px", flex: 1, overflowY: "auto" }}>
              <div className="modal-text-label">Extracted Context — Page {currentPage}</div>
              <div className="modal-text-body">
                {highlightText(item.full_text || item.text || "No text content available.", query)}
              </div>
            </div>

            <div className="modal-footer">
              <button
                onClick={handleCopyClause}
                className="btn-download"
                style={{
                  background: clauseCopied ? "var(--green-bg)" : undefined,
                  borderColor: clauseCopied ? "var(--green)" : undefined,
                  color: clauseCopied ? "var(--green)" : undefined,
                }}
              >
                {clauseCopied ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                    Copy Clause
                  </>
                )}
              </button>
              <a
                href={`${API_URL}/document/${item.file}`}
                target="_blank"
                rel="noreferrer"
                className="btn-download"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Source Card ─────────────────────────────────── */
function SourceCard({ item, onExpand, query }) {
  const badgeClass = getBadgeClass(item.similarity);
  return (
    <div className="source-card" onClick={() => onExpand(item)} title="Click to open document">
      <div className="source-card-top">
        <div className="source-card-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="source-card-name">{item.file}</div>
          {item.page && (
            <div className="source-card-pages">Page {item.page}</div>
          )}
        </div>
        <span className={`source-score-badge ${badgeClass}`}>{item.similarity}%</span>
      </div>
      {item.text && (
        <div className="source-snippet">
          {highlightText(item.text, query)}
        </div>
      )}
    </div>
  );
}

/* ── Copy button ─────────────────────────────────── */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      className={`msg-action-btn${copied ? " copied" : ""}`}
      onClick={handleCopy}
      title="Copy response"
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

/* ── Message Row ─────────────────────────────────── */
function MessageRow({ msg, onExpand, query }) {
  const isUser = msg.role === "user";

  return (
    <div className={`message-row${isUser ? " user" : ""}`}>
      {/* Avatar */}
      <div className={`msg-avatar${isUser ? " user" : " ai"}`}>
        {isUser ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </div>

      {/* Body */}
      <div className="msg-body">
        {isUser ? (
          <div className="user-bubble">{msg.content}</div>
        ) : (
          <>
            {msg.loading ? (
              <div className="ai-typing-dots">
                <span /><span /><span />
              </div>
            ) : (
              <>
                <div className="ai-text-content">
                  {msg.streaming ? (
                    <>
                      <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                        {markKeywords(msg.content || "", query)}
                      </ReactMarkdown>
                      <span className="streaming-cursor" />
                    </>
                  ) : (
                    <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                      {markKeywords(msg.content || "", query)}
                    </ReactMarkdown>
                  )}
                </div>

                {/* Action bar + Sources — only shown AFTER streaming finishes */}
                {!msg.streaming && (
                  <>
                    {msg.content && (
                      <div className="msg-actions">
                        <CopyButton text={msg.content} />
                      </div>
                    )}

                    {msg.results && msg.results.length > 0 && (
                      <div className="sources-section">
                        <div className="sources-label">
                          Sources &amp; References
                        </div>
                        <div className="sources-row">
                          {msg.results.slice(0, 6).map((res, i) => (
                            <SourceCard key={i} item={res} onExpand={onExpand} query={query} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Export CSV ──────────────────────────────────── */
function exportToCSV(messages, query) {
  const rows = [["Document", "Page", "Match %", "Excerpt", "Query"]];
  messages.forEach(msg => {
    if (msg.results && msg.results.length > 0) {
      msg.results.forEach(r => {
        rows.push([
          r.file || "",
          r.page || "",
          (r.similarity || 0) + "%",
          (r.text || "").replace(/"/g, '""').replace(/\n/g, " "),
          (query || "").replace(/"/g, '""'),
        ]);
      });
    }
  });
  const csv = rows.map(row => row.map(v => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clauses-${(query || "results").slice(0, 30).replace(/\s+/g, "-")}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Results ─────────────────────────────────────── */
function Results({ messages, isSearching, query }) {
  const [modalItem, setModalItem] = useState(null);

  if (!messages || messages.length === 0) return null;

  const hasResults = messages.some(m => m.results && m.results.length > 0);

  return (
    <>
      <div className="chat-messages-container">
        {hasResults && (
          <div className="export-row">
            <button className="btn-export" onClick={() => exportToCSV(messages, query)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export CSV
            </button>
          </div>
        )}

        <div className="messages-list">
          {messages.map((msg, i) => (
            <MessageRow
              key={i}
              msg={msg}
              onExpand={setModalItem}
              query={query}
            />
          ))}
        </div>
      </div>

      {modalItem && (
        <DocumentModal item={modalItem} onClose={() => setModalItem(null)} query={query} />
      )}
    </>
  );
}

export default Results;
