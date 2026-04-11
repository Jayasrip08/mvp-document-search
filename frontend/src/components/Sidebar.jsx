import { useState, useEffect } from "react";

function Sidebar({ isOpen, setIsOpen }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const res = await fetch("http://127.0.0.1:8000/documents");
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data = await res.json();
      setDocuments(data);
      setError(null);
    } catch (err) {
      setError("Could not load library");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDocuments();
    }
  }, [isOpen]);

  const formatSize = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString();
  };

  return (
    <div className={`chat-sidebar ${isOpen ? "open" : "closed"}`}>
      <div className="sidebar-header">
        <div className="sidebar-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span>Document Library</span>
        </div>
        <button 
          className="sidebar-close-btn"
          onClick={() => setIsOpen(false)}
          aria-label="Close sidebar"
        >
          ✕
        </button>
      </div>

      <div className="sidebar-content">
        {loading ? (
          <div className="sidebar-loading">
            <div className="mini-spinner" />
          </div>
        ) : error ? (
          <div className="sidebar-error">{error}</div>
        ) : documents.length === 0 ? (
          <div className="sidebar-empty">No documents found.</div>
        ) : (
          <div className="document-list">
            {documents.map((doc) => (
              <div key={doc.id} className="document-list-item">
                <div className="doc-item-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </div>
                <div className="doc-item-info">
                  <div className="doc-item-name" title={doc.filename}>
                    {doc.filename}
                  </div>
                  <div className="doc-item-meta">
                    {formatSize(doc.file_size)} • {formatDate(doc.upload_time)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Sidebar;
