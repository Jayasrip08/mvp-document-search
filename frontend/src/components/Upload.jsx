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
            <span style={{ color: "var(--accent-teal)" }}>
              File selected — click to change
            </span>
          ) : (
            <>or <span>browse to upload</span> · PDF only</>
          )}
        </div>
      </div>

      {/* Selected file */}
      {file && !isLoading && (
        <div className="file-badge">
          📄 {file.name}
          <span style={{ opacity: 0.6, marginLeft: 6 }}>
            ({(file.size / 1024).toFixed(1)} KB)
          </span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="spinner-wrapper">
          <div className="spinner" />
          <span>Searching...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Button */}
      {!isLoading && (
        <button
          className="btn-search"
          onClick={handleUpload}
          disabled={!file}
        >
          🔍 Upload & Search Similar Documents
        </button>
      )}
    </div>
  );
}

export default Upload;