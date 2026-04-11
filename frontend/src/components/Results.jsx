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

/* ── Full-text Modal ─────────────────────────────── */
function TextModal({ item, onClose }) {
  const badgeClass = getBadgeClass(item.similarity);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Full document text"
    >
      <div className="modal-box">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <div className="modal-title-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <span className="modal-title-text">{item.file}</span>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Meta */}
        <div className="modal-meta">
          <span className={`match-badge ${badgeClass}`}>
            {getBadgeEmoji(item.similarity)}&nbsp;{getBadgeLabel(item.similarity)} — {item.similarity}%
          </span>
          {item.matching_pages && item.matching_pages.length > 0 && (
            <span className="page-badge" style={{display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              Matches on Pages: {item.matching_pages.join(", ")}
            </span>
          )}
        </div>

        <div className="modal-divider" />

        {/* Full text */}
        <div className="modal-text-label">Extracted matching content</div>
        <div className="modal-text-body">
          {item.full_text || item.text || "No text content available."}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <a
            href={`http://127.0.0.1:8000/document/${item.file}`}
            target="_blank"
            rel="noreferrer"
            className="btn-download"
            aria-label={`Download ${item.file}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Document
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Single Result Card ──────────────────────────── */
function ResultCard({ item, index, onExpand }) {
  const badgeClass = getBadgeClass(item.similarity);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textToCopy = item.full_text || item.text || "";
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(err => console.error("Could not copy text: ", err));
    }
  };

  return (
    <div
      className="result-card"
      style={{ animationDelay: `${index * 0.07}s` }}
    >
      {/* Top row */}
      <div className="card-top">
        <div className="card-filename">
          <div className="file-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div>
            <div className="filename-text" title={item.file}>{item.file}</div>
            <div className="filename-sub">
              PDF Document {item.matching_pages && item.matching_pages.length > 0 && `· Found on Pages: ${item.matching_pages.join(", ")}`}
            </div>
          </div>
        </div>
        <span className={`match-badge ${badgeClass}`}>
          {getBadgeEmoji(item.similarity)}&nbsp;{getBadgeLabel(item.similarity)}&nbsp;·&nbsp;{item.similarity}%
        </span>
      </div>

      {/* Similarity bar */}
      <div className="similarity-bar-track" aria-label={`${item.similarity}% match`}>
        <div
          className={`similarity-bar-fill ${badgeClass}`}
          style={{ width: `${Math.min(item.similarity, 100)}%` }}
        />
      </div>

      {/* Preview snippet */}
      <p className="card-preview">
        {item.text || "No preview available."}
      </p>

      {/* Actions */}
      <div className="card-actions">
        <button
          className="btn-expand"
          onClick={() => onExpand(item)}
          aria-label={`View full text for ${item.file}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          View Full Text
        </button>

        <button
          className="btn-expand"
          onClick={handleCopy}
          aria-label={`Copy text from ${item.file}`}
        >
          {copied ? "✅ Copied!" : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            </>
          )}
        </button>

        <a
          href={`http://127.0.0.1:8000/document/${item.file}`}
          target="_blank"
          rel="noreferrer"
          className="btn-download"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download
        </a>
      </div>
    </div>
  );
}

/* ── Results Panel ───────────────────────────────── */
function Results({ results, count, clearResults }) {
  const [modalItem, setModalItem] = useState(null);

  if (results.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-iconbox">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <div className="empty-state-title">No results yet</div>
        <p className="empty-state-sub">
          Upload a PDF above to find semantically similar documents in your library.
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="results-section" aria-label="Search results">
        {/* Back Navigation */}
        <div style={{ marginBottom: '24px' }}>
          <button 
            className="btn-back" 
            onClick={clearResults}
            aria-label="Go Back"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Go Back
          </button>
        </div>

        {/* Header */}
        <div className="results-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="results-headline">
              Found <em>{count}</em> similar document{count !== 1 ? "s" : ""}
            </h2>
            <span className="results-count-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}>
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              {count} result{count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Cards */}
        {results.map((item, i) => (
          <ResultCard
            key={i}
            item={item}
            index={i}
            onExpand={setModalItem}
          />
        ))}
      </section>

      {/* Modal */}
      {modalItem && (
        <TextModal item={modalItem} onClose={() => setModalItem(null)} />
      )}
    </>
  );
}

export default Results;