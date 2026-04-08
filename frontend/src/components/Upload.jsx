import { useState, useRef, useCallback } from "react";

function Upload({ setResults, setCount }) {
  const [file, setFile]           = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState(null);
  const [dragOver, setDragOver]   = useState(false);
  const inputRef                  = useRef(null);

  /* ── file selection helpers ── */
  const pickFile = (selected) => {
    if (!selected) return;
    if (selected.type !== "application/pdf") {
      setError("Only PDF files are supported. Please choose a .pdf file.");
      return;
    }
    setFile(selected);
    setError(null);
  };

  /* ── drag-and-drop handlers ── */
  const onDragOver  = useCallback((e) => { e.preventDefault(); setDragOver(true);  }, []);
  const onDragLeave = useCallback((e) => { e.preventDefault(); setDragOver(false); }, []);
  const onDrop      = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files[0]);
  }, []);

  /* ── main search handler ── */
  const handleUpload = async () => {
    if (!file) {
      setError("Please select a PDF file before searching.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);
    setCount(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://127.0.0.1:8000/search", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Server error (${res.status}): ${detail || "Unexpected response from server."}`);
      }

      const data = await res.json();
      setResults(data.results ?? []);
      setCount(data.count ?? 0);
    } catch (err) {
      if (err.name === "TypeError" && err.message.includes("fetch")) {
        setError("Cannot reach the backend server. Make sure it is running on http://127.0.0.1:8000.");
      } else {
        setError(err.message || "An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="upload-wrapper">
      {/* Drop zone */}
      <div
        className={`drop-zone${dragOver ? " drag-over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        aria-label="Upload PDF file"
      >
        <input
          ref={inputRef}
          id="pdf-file-input"
          type="file"
          accept=".pdf,application/pdf"
          className="hidden-input"
          onChange={(e) => pickFile(e.target.files[0])}
        />

        <span className="drop-zone-icon">📄</span>
        <div className="drop-zone-title">
          {file ? "Change document" : "Drop your PDF here"}
        </div>
        <div className="drop-zone-sub">
          {file ? (
            <span style={{ color: "var(--accent-teal)" }}>File selected — click to change</span>
          ) : (
            <>or <span>browse to upload</span> · PDF only</>
          )}
        </div>
      </div>

      {/* Selected file badge */}
      {file && !isLoading && (
        <div className="file-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          {file.name}
          <span style={{ opacity: 0.6, fontWeight: 400, marginLeft: 4 }}>
            ({(file.size / 1024).toFixed(1)} KB)
          </span>
        </div>
      )}

      {/* Spinner */}
      {isLoading && (
        <div className="spinner-wrapper">
          <div className="spinner" role="status" aria-label="Searching" />
          <span className="spinner-text">Analyzing document &amp; searching</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="error-banner" role="alert">
          <span className="error-banner-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Search button */}
      {!isLoading && (
        <button
          id="search-btn"
          className="btn-search"
          onClick={handleUpload}
          disabled={!file}
          aria-label="Upload and search for similar documents"
        >
          🔍 &nbsp;Upload &amp; Search Similar Documents
        </button>
      )}
    </div>
  );
}

export default Upload;