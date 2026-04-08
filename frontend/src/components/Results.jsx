import { useState } from "react";

/* ── helpers ─────────────────────────────────── */
function getBadgeClass(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

function getBadgeLabel(score) {
  if (score >= 75) return "✅ High match";
  if (score >= 50) return "⚠️ Moderate";
  return "🔴 Low match";
}

/* ── Full-text Modal ─────────────────────────── */
function TextModal({ item, onClose }) {
  const badgeClass = getBadgeClass(item.similarity);

  // Close on overlay click
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label="Full document text">
      <div className="modal-box">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <span>📄</span>
            <span className="filename-text">{item.file}</span>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Meta row */}
        <div className="modal-meta">
          <span className={`match-badge ${badgeClass}`}>
            {getBadgeLabel(item.similarity)} — {item.similarity}%
          </span>
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
            📥 Download Document
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Single Result Card ──────────────────────── */
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
          <span className="file-icon">📄</span>
          <span className="filename-text" title={item.file}>{item.file}</span>
        </div>
        <span className={`match-badge ${badgeClass}`}>
          {getBadgeLabel(item.similarity)} {item.similarity}%
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
          📖 View Full Text
        </button>

        <a
          href={`http://127.0.0.1:8000/document/${item.file}`}
          target="_blank"
          rel="noreferrer"
          className="btn-download"
          onClick={(e) => e.stopPropagation()}
        >
          📥 Download
        </a>
      </div>
    </div>
  );
}

/* ── Results Panel ───────────────────────────── */
function Results({ results, count }) {
  const [modalItem, setModalItem] = useState(null);

  if (results.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">🗂️</span>
        <p>Upload a PDF above to find similar documents</p>
      </div>
    );
  }

  return (
    <>
      <section className="results-section" aria-label="Search results">
        {/* Header */}
        <div className="results-header">
          <h2 className="results-headline">
            We found <span>{count}</span> similar document{count !== 1 ? "s" : ""}
          </h2>
          <span className="results-badge">{count} results</span>
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