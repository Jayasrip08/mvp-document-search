import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "/api";

function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hrs  < 24)  return `${hrs}h ago`;
  if (days < 7)   return `${days}d ago`;
  return d.toLocaleDateString();
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const CATEGORY_COLORS = {
  "NDA":                  { bg: "rgba(139,92,246,0.12)", color: "#a78bfa" },
  "Service Agreement":    { bg: "rgba(59,130,246,0.12)", color: "#60a5fa" },
  "Maintenance Contract": { bg: "rgba(16,185,129,0.12)", color: "#34d399" },
  "Employment Agreement": { bg: "rgba(245,158,11,0.12)", color: "#fbbf24" },
  "Lease":                { bg: "rgba(239,68,68,0.12)",  color: "#f87171" },
  "Other":                { bg: "rgba(107,114,128,0.12)", color: "#9ca3af" },
  "Unclassified":         { bg: "rgba(107,114,128,0.1)",  color: "#6b7280" },
};

function CategoryBadge({ category }) {
  const style = CATEGORY_COLORS[category] || CATEGORY_COLORS["Other"];
  return (
    <span className="doc-category-badge" style={{ background: style.bg, color: style.color }}>
      {category || "Unclassified"}
    </span>
  );
}

const CLAUSE_PILL_COLORS = {
  "Payment Terms":               { bg: "rgba(16,185,129,0.12)",  color: "#10b981" },
  "Termination for Convenience": { bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
  "Termination for Cause":       { bg: "rgba(239,68,68,0.1)",    color: "#f87171" },
  "Indemnification":             { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b" },
  "Limitation of Liability":     { bg: "rgba(245,158,11,0.1)",   color: "#fbbf24" },
  "Auto-Renewal":                { bg: "rgba(139,92,246,0.12)",  color: "#a78bfa" },
  "Confidentiality / NDA":       { bg: "rgba(59,130,246,0.12)",  color: "#60a5fa" },
  "Force Majeure":               { bg: "rgba(107,114,128,0.12)", color: "#9ca3af" },
  "Governing Law":               { bg: "rgba(20,184,166,0.12)",  color: "#2dd4bf" },
  "Dispute Resolution":          { bg: "rgba(236,72,153,0.12)",  color: "#f472b6" },
  "Intellectual Property":       { bg: "rgba(99,102,241,0.12)",  color: "#818cf8" },
  "Non-Compete":                 { bg: "rgba(234,179,8,0.12)",   color: "#eab308" },
  "Warranties":                  { bg: "rgba(34,197,94,0.12)",   color: "#22c55e" },
};

/* ── Document Library Tab ───────────────────────── */
function DocumentLibrary() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTag, setFilterTag] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/documents`)
      .then(r => r.json())
      .then(data => { setDocs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="sidebar-loading">
        <div className="sidebar-spinner" />
        <span>Loading library…</span>
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="sidebar-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, marginBottom: 8 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        No documents indexed yet.
      </div>
    );
  }

  // Collect all unique clause tags across all docs
  const allTags = [...new Set(
    docs.flatMap(d => (d.tags || []).map(t => t.type))
  )].sort();

  // Filter docs by active tag
  const filteredDocs = filterTag
    ? docs.filter(d => (d.tags || []).some(t => t.type === filterTag))
    : docs;

  // Group by category
  const grouped = {};
  filteredDocs.forEach(d => {
    const cat = d.category || "Unclassified";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(d);
  });

  return (
    <div className="doc-library-list">
      <div className="sidebar-section-label" style={{ padding: "12px 14px 4px" }}>
        {docs.length} documents indexed
      </div>

      {allTags.length > 0 && (
        <div className="lib-filter-bar">
          <div className="lib-filter-label">Filter by clause:</div>
          <div className="lib-filter-chips">
            {allTags.map(tag => {
              const style = CLAUSE_PILL_COLORS[tag] || { bg: "rgba(107,114,128,0.12)", color: "#9ca3af" };
              const active = filterTag === tag;
              return (
                <button
                  key={tag}
                  className={`lib-filter-chip${active ? " active" : ""}`}
                  style={active ? { background: style.color, color: "#fff", borderColor: style.color } : { background: style.bg, color: style.color, borderColor: "transparent" }}
                  onClick={() => setFilterTag(active ? null : tag)}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="sidebar-empty" style={{ padding: "20px 14px" }}>No documents match this filter.</div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="doc-library-group">
            <div className="doc-library-group-label">{cat}</div>
            {items.map((doc, i) => (
              <a
                key={i}
                href={`${API_URL}/document/${encodeURIComponent(doc.filename)}`}
                target="_blank"
                rel="noreferrer"
                className="doc-library-item"
                title={doc.filename}
              >
                <div className="doc-lib-icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div className="doc-lib-info">
                  <div className="doc-lib-name">{doc.filename}</div>
                  <div className="doc-lib-meta">
                    {formatFileSize(doc.file_size)}
                    {doc.upload_time && <span> · {formatDate(doc.upload_time)}</span>}
                  </div>
                  {doc.tags && doc.tags.length > 0 && (
                    <div className="doc-lib-tags">
                      {doc.tags.slice(0, 4).map((t, ti) => {
                        const s = CLAUSE_PILL_COLORS[t.type] || { bg: "rgba(107,114,128,0.1)", color: "#9ca3af" };
                        return (
                          <span key={ti} className="doc-lib-tag-pill" style={{ background: s.bg, color: s.color }}>
                            {t.type}
                          </span>
                        );
                      })}
                      {doc.tags.length > 4 && (
                        <span className="doc-lib-tag-pill" style={{ background: "rgba(107,114,128,0.1)", color: "#9ca3af" }}>
                          +{doc.tags.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="doc-lib-arrow">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </div>
              </a>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

/* ── Main Sidebar ───────────────────────────────── */
function Sidebar({ isOpen, setIsOpen, history, onHistoryClick, onDeleteHistory }) {
  const [activeTab, setActiveTab] = useState("history");

  const handleHistoryItemClick = (item) => {
    onHistoryClick(item);
    if (window.innerWidth < 768) setIsOpen(false);
  };

  const onNewChat = () => {
    onHistoryClick(null);
    if (window.innerWidth < 768) setIsOpen(false);
  };

  // Group history by date
  const now = new Date();
  const groups = { Today: [], "This week": [], Older: [] };
  (history || []).forEach(item => {
    const d = new Date(item.timestamp);
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays < 1)      groups["Today"].push(item);
    else if (diffDays < 7) groups["This week"].push(item);
    else                   groups["Older"].push(item);
  });

  return (
    <div className={`chat-sidebar ${isOpen ? "open" : "closed"}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <span>DocSearch AI</span>
        </div>
        <button className="sidebar-close-btn" onClick={() => setIsOpen(false)} aria-label="Close sidebar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* New Chat */}
      <div className="new-chat-container">
        <button className="new-chat-btn" onClick={onNewChat}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Chat
        </button>
      </div>

      {/* Tabs */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab${activeTab === "history" ? " active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 5 }}>
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          History
        </button>
        <button
          className={`sidebar-tab${activeTab === "library" ? " active" : ""}`}
          onClick={() => setActiveTab("library")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 5 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          Library
        </button>
      </div>

      {/* Tab Content */}
      <div className="sidebar-content">
        {activeTab === "history" ? (
          !history || history.length === 0 ? (
            <div className="sidebar-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, marginBottom: 8 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              No chats yet. Ask something!
            </div>
          ) : (
            <div className="history-list">
              {Object.entries(groups).map(([label, items]) =>
                items.length === 0 ? null : (
                  <div key={label}>
                    <div className="history-group-label">{label}</div>
                    {items.map((item, i) => (
                      <div
                        key={i}
                        className="history-item"
                        onClick={() => handleHistoryItemClick(item)}
                        title={item.query}
                      >
                        <div className="history-item-icon">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                          </svg>
                        </div>
                        <div className="history-item-body">
                          <div className="history-query">{item.query}</div>
                          <div className="history-date">{formatDate(item.timestamp)}</div>
                        </div>
                        <button
                          className="history-delete-btn"
                          onClick={e => { e.stopPropagation(); onDeleteHistory(item.id); }}
                          aria-label="Delete"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )
        ) : (
          <DocumentLibrary />
        )}
      </div>
    </div>
  );
}

export default Sidebar;
