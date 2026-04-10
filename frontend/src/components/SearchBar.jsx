import { useState } from "react";

function SearchBar({ setResults, setCount }) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResults([]);
    setCount(0);

    try {
      const res = await fetch("http://127.0.0.1:8000/text-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Server error (${res.status}): ${detail || "Unexpected response."}`);
      }

      const data = await res.json();
      const resultData = Array.isArray(data) ? data : data.results || [];

      setResults(resultData);
      setCount(resultData.length);
    } catch (err) {
      if (err.name === "TypeError" && err.message.includes("fetch")) {
        setError("Cannot reach the backend server. Make sure it is running on http://127.0.0.1:8000.");
      } else {
        setError(err.message || "An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="search-bar-wrapper">
      <div className="section-label">🔍 Quick Search</div>
      <div className="glass-card search-card">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-container">
            <input
              type="text"
              placeholder="Type your question or keywords here..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input"
              disabled={isLoading}
            />
            {query && !isLoading && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            className="btn-search-text"
            disabled={isLoading || !query.trim()}
          >
            {isLoading ? (
              <div className="mini-spinner" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
            )}
            Search
          </button>
        </form>
        {error && (
          <div className="error-banner mini" style={{ marginTop: "12px" }}>
            <span className="error-banner-icon">⚠️</span>
            <span className="error-banner-text">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchBar;
