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
  if (score >= 75) return "✅";
  if (score >= 50) return "🔶";
  return "🔴";
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
            <div className="modal-title-icon">📄</div>
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
            <span className="page-badge">
              📄 Matches on Pages: {item.matching_pages.join(", ")}
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

  return (
    <div
      className="result-card"
      style={{ animationDelay: `${index * 0.07}s` }}
    >
      {/* Top row */}
      <div className="card-top">
        <div className="card-filename">
          <div className="file-icon-box">📄</div>
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
function Results({ results, count }) {
  const [modalItem, setModalItem] = useState(null);

  if (results.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-iconbox">🗂️</div>
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
        {/* Header */}
        <div className="results-header">
          <h2 className="results-headline">
            Found <em>{count}</em> similar document{count !== 1 ? "s" : ""}
          </h2>
          <span className="results-count-badge">
            ✦ {count} result{count !== 1 ? "s" : ""}
          </span>
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