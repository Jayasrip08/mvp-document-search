import { useState, useRef } from "react";

function SearchBar({ setLastQuery, fetchData, performSearch }) {
  const [query, setQuery] = useState("");
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      if (selected.type !== "application/pdf") {
        setError("Only PDF files are supported.");
        return;
      }
      setFile(selected);
      setError(null);
    }
    // reset input value so the same file could be selected again if needed
    e.target.value = null;
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const currentQuery = query.trim();
    if (!currentQuery && !file) return;

    setIsLoading(true);
    setError(null);
    setQuery("");   // Clear input immediately
    setFile(null);  // Clear file immediately

    try {
      if (file) {
        setLastQuery(`Uploaded: ${file.name}`);

        const formData = new FormData();
        formData.append("file", file);
        
        const res = await fetch(`${import.meta.env.VITE_API_URL || "/api"}/search`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        
        await performSearch(currentQuery, file); 
      } else {
        await performSearch(currentQuery);
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="search-bar-wrapper">
      <div className="glass-card search-card chat-search-card">
        {file && (
          <div className="chat-file-chip">
            <span className="file-chip-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </span>
            <span className="file-chip-name">{file.name}</span>
            <button
              type="button"
              className="file-chip-remove"
              onClick={() => setFile(null)}
              disabled={isLoading}
            >
              ✕
            </button>
          </div>
        )}
        <form onSubmit={handleSearch} className="search-form chat-search-form">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,application/pdf"
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="chat-attachment-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || file !== null}
            aria-label="Attach File"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          
          <div className="search-input-container chat-input-container">
            <input
              type="text"
              placeholder={file ? "Add an optional message..." : "Message DocSearch AI..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input chat-input"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="chat-submit-btn"
            disabled={isLoading || (!query.trim() && !file)}
            aria-label="Send message"
          >
            {isLoading ? (
              <div className="mini-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </form>
        {error && (
          <div className="error-banner mini" style={{ marginTop: "12px", border: "none", background: "transparent" }}>
            <span className="error-banner-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </span>
            <span className="error-banner-text">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchBar;
