import { useState } from "react";

/* ── helpers ─────────────────────────────────────── */
function getBadgeClass(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

function getBadgeLabel(score) {
  if (score >= 75) return "High Match";
  if (score >= 50) return "Moderate";
  return "Low Match";
}

function getBadgeEmoji(score) {
  if (score >= 75) return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}>
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
  if (score >= 50) return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}>
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  );
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}>
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>
  );
}

function highlightText(text, query) {
  if (!query) return text;
  
  // Split query into words, filter out short common words
  const keywords = query.split(/\s+/)
    .filter(word => word.length > 2)
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // escape regex chars
    
  if (keywords.length === 0) return text;
  
  // Create a combined regex for all keywords
  const regex = new RegExp(`(${keywords.join('|')})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <span>
      {parts.map((part, i) => {
        const isMatch = keywords.some(kw => new RegExp(`^${kw}$`, 'i').test(part));
        return isMatch ? <mark key={i}>{part}</mark> : part;
      })}
    </span>
  );
}

/* ── Full-document Viewer Modal ─────────────────── */
function DocumentModal({ item, onClose, query }) {
  const [matchIndex, setMatchIndex] = useState(0);
  const badgeClass = getBadgeClass(item.similarity);
  
  const totalMatches = item.matching_pages?.length || 0;
  const currentPage = item.matching_pages?.[matchIndex] || 1;
  const pdfUrl = `http://127.0.0.1:8000/document/${item.file}?v=${Date.now()}#page=${currentPage}`;

  const nextMatch = () => setMatchIndex(prev => (prev + 1) % totalMatches);
  const prevMatch = () => setMatchIndex(prev => (prev - 1 + totalMatches) % totalMatches);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className="modal-box">
        {/* Header */}
        <div className="modal-header" style={{padding: '20px 24px', marginBottom: 0, borderBottom: '1px solid var(--glass-border)'}}>
          <div className="modal-title">
            <div className="modal-title-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </div>
            <span className="modal-title-text">{item.file}</span>
          </div>
          <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
            <span className={`match-badge ${badgeClass}`} style={{margin: 0}}>
              {getBadgeEmoji(item.similarity)}&nbsp;{item.similarity}% match
            </span>
            <button className="modal-close" onClick={onClose} aria-label="Close modal">✕</button>
          </div>
        </div>

        {/* Split Content */}
        <div className="modal-split-content">
          {/* PDF Side */}
          <div className="pdf-side">
            <iframe 
              src={pdfUrl} 
              className="pdf-iframe" 
              title="PDF Viewer" 
              key={`${item.file}-${currentPage}`} // Force reload on page change
            />
          </div>

          {/* Text/Analysis Side */}
          <div className="text-side">
            {totalMatches > 0 && (
              <div className="match-navigator-bar">
                <div className="match-nav-label">Matched Concept {matchIndex + 1} of {totalMatches}</div>
                <div className="match-nav-btns">
                  <button className="btn-nav" onClick={prevMatch} disabled={totalMatches <= 1}>← Prev</button>
                  <button className="btn-nav" onClick={nextMatch} disabled={totalMatches <= 1}>Next →</button>
                </div>
              </div>
            )}
            
            <div style={{padding: '24px', flex: 1, overflowY: 'auto'}}>
              <div className="modal-text-label">Extracted Page Context (Page {currentPage})</div>
              <div className="modal-text-body" style={{background: 'transparent', border: 'none', padding: 0, maxHeight: 'none'}}>
                {highlightText(item.full_text || item.text || "No text content available.", query)}
              </div>
            </div>

            {/* Footer fixed at bottom of text side */}
            <div className="modal-footer" style={{padding: '16px 24px', background: 'var(--bg-surface-2)', borderTop: '1px solid var(--glass-border)', marginTop: 0}}>
              <a
                href={`${import.meta.env.VITE_API_URL || "/api"}/document/${item.file}`}
                target="_blank"
                rel="noreferrer"
                className="btn-download"
                style={{width: '100%', justifyContent: 'center'}}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download Full Document
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function CitationCard({ item, onExpand, query }) {
  const badgeClass = getBadgeClass(item.similarity);
  return (
    <div className="citation-card" onClick={() => onExpand(item)}>
      <div className="citation-header">
        <div className="citation-file">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span className="citation-filename">{item.file}</span>
        </div>
        <div className={`citation-score ${badgeClass}`}>
          {item.similarity}% match
        </div>
      </div>
      <div className="citation-snippet">
        {highlightText(item.text, query)}
      </div>
    </div>
  );
}

function CopyToClipboard({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button 
      className={`copy-btn-mini ${copied ? "copied" : ""}`} 
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Copied!</span>
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

/* ── Message Bubble ─────────────────────────────── */
function MessageBubble({ msg, onExpand, query }) {
  const isUser = msg.role === "user";

  return (
    <div className={`message-bubble-wrapper ${isUser ? "user" : "assistant"}`}>
      {!isUser && (
        <div className="assistant-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
      )}
      <div className="message-bubble">
        {isUser ? (
          <div className="message-content">{msg.content}</div>
        ) : (
          <div className="message-content">
            {msg.loading ? (
              <div className="ai-loading-skeleton">
                <div className="skeleton-line full" />
                <div className="skeleton-line mid" />
                <div className="skeleton-line short" />
              </div>
            ) : (
              <>
                <div className="ai-text">{highlightText(msg.content, query)}</div>
                <div className="message-footer">
                  <CopyToClipboard text={msg.content} />
                </div>
                {msg.results && msg.results.length > 0 && (
                  <div className="ai-citations">
                    <div className="citations-label">Sources & References</div>
                    <div className="citations-grid">
                      {msg.results.slice(0, 4).map((res, i) => (
                        <CitationCard key={i} item={res} onExpand={onExpand} query={query} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="user-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
      )}
    </div>
  );
}

/* ── Results Panel (Refactored to Chat Area) ─────── */
function Results({ messages, isSearching, query }) {
  const [modalItem, setModalItem] = useState(null);

  if (!messages || messages.length === 0) {
    return null; // Handled by App.jsx welcome state
  }

  return (
    <>
      <div className="chat-messages-container">


        {/* Message List */}
        <div className="messages-list">
          {messages.map((msg, i) => (
            <MessageBubble 
              key={i} 
              msg={msg} 
              onExpand={setModalItem} 
              query={query}
            />
          ))}
        </div>
      </div>

      {/* Modal for full document view */}
      {modalItem && (
        <DocumentModal item={modalItem} onClose={() => setModalItem(null)} query={query} />
      )}
    </>
  );
}

export default Results;