import { useState, useRef, useCallback } from "react";

function Upload({ setResults, setCount }) {
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  /* ── file selection ── */
  const pickFile = (selected) => {
    if (!selected) return;
    if (selected.type !== "application/pdf") {
      setError("Only PDF files are supported. Please choose a .pdf file.");
      return;
    }
    setFile(selected);
    setError(null);
  };

  /* ── drag-and-drop ── */
  const onDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback((e) => { e.preventDefault(); setDragOver(false); }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files[0]);
  }, []);

  /* ── search ── */
  const handleUpload = async () => {
    if (!file) { setError("Please select a PDF file before searching."); return; }
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
        throw new Error(`Server error (${res.status}): ${detail || "Unexpected response."}`);
      }

      const data = await res.json();

      console.log("API RESPONSE:", data); // 🔍 Debug

      // ✅ FIX: handle both array and object response
      const resultData = Array.isArray(data) ? data : data.results || [];

      setResults(resultData);
      setCount(resultData.length);

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

      {/* ── Drop Zone ── */}
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
          type="file"
          accept=".pdf,application/pdf"
          className="hidden-input"
          onChange={(e) => pickFile(e.target.files[0])}
        />

        <div className="drop-zone-inner">
          <div className="drop-zone-iconbox">
            {file ? "📄" : "📂"}
          </div>
          <div className="drop-zone-title">
            {file ? "Document ready" : "Drop your PDF here"}
          </div>
          <div className="drop-zone-sub">
            {file
              ? <span className="highlight">Click to change file</span>
              : <>or <span className="highlight">browse to upload</span></>
            }
          </div>
          <div className="drop-zone-tags">
            <span className="drop-zone-tag">PDF only</span>
            <span className="drop-zone-tag">Any size</span>
            <span className="drop-zone-tag">Drag &amp; drop</span>
          </div>
        </div>
      </div>

      {/* ── File badge ── */}
      {file && !isLoading && (
        <div className="file-badge">
          <div className="file-badge-icon">📄</div>
          <span className="file-badge-name">{file.name}</span>
          <span className="file-badge-size">
            {file.size >= 1024 * 1024
              ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
              : `${(file.size / 1024).toFixed(1)} KB`}
          </span>
        </div>
      )}

    {/* ── Spinner ── */ }
    {
      isLoading && (
        <div className="spinner-wrapper">
          <div className="spinner-ring" role="status" aria-label="Searching" />
          <span className="spinner-text">Analyzing &amp; searching</span>
        </div>
      )
    }

    {/* ── Error banner ── */ }
    {
      error && (
        <div className="error-banner" role="alert">
          <span className="error-banner-icon">⚠️</span>
          <span className="error-banner-text">{error}</span>
        </div>
      )
    }

    {/* ── Search button ── */ }
    {
      !isLoading && (
        <button
          className="btn-search"
          onClick={handleUpload}
          disabled={!file}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          Upload &amp; Find Similar Documents
        </button>
      )
    }
    </div >
  );
  }

  export default Upload;