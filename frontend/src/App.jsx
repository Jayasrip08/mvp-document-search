import { useState, useEffect } from "react";
import Upload from "./components/Upload";
import SearchBar from "./components/SearchBar";
import Results from "./components/Results";
import "./styles.css";

/* ── Theme persistence ─────────────────────────── */
function getInitialTheme() {
  const saved = localStorage.getItem("docsearch-theme");
  if (saved) return saved === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function App() {
  const [results, setResults] = useState([]);
  const [count,   setCount]   = useState(0);
  const [dark,    setDark]    = useState(getInitialTheme);
  const [docCount, setDocCount] = useState(0);
  const [isResetting, setIsResetting] = useState(false);

  /* Apply / remove .dark class on <html> */
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("docsearch-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("docsearch-theme", "light");
    }
  }, [dark]);

  /* Fetch library stats */
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/stats");
        const data = await res.json();
        setDocCount(data.document_count || 0);
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      }
    };
    fetchStats();
  }, []);

  const handleReset = async () => {
    if (!window.confirm("Are you sure you want to clean the entire database? This will delete all indexed documents and source files.")) return;

    setIsResetting(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/reset", { method: "POST" });
      const data = await res.json();
      if (data.status === "success") {
        setResults([]);
        setCount(0);
        setDocCount(0);
        // Page refresh or state clear is handled
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      console.error("Reset failed:", err);
      alert("Failed to reach server.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      {/* ─── Navbar ─────────────────────────────────── */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">🔍</div>
          <div>
            <div className="navbar-title">DocSearch AI</div>
            <div className="navbar-subtitle">Semantic Document Search</div>
          </div>
        </div>

        <div className="navbar-actions">
          <button
            className="btn-danger-outline"
            onClick={handleReset}
            disabled={isResetting}
            title="Wipe database and start fresh"
          >
            {isResetting ? "Cleaning..." : "Reset Database"}
          </button>

          {/* Dark / Light toggle */}
          <button
            id="theme-toggle-btn"
            className="theme-toggle"
            onClick={() => setDark(d => !d)}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="theme-toggle-icon">{dark ? "🌙" : "☀️"}</span>
            <div className="theme-toggle-track" aria-hidden="true">
              <div className="theme-toggle-thumb" />
            </div>
            <span>{dark ? "Dark" : "Light"}</span>
          </button>
        </div>
      </nav>

      {/* ─── Main content ───────────────────────────── */}
      <div className="page-wrapper">
        <div className={`container ${results.length > 0 ? "has-results" : ""}`}>
          
          <div className="left-panel">
            {/* Hero */}
            <header className="app-header">
              <div className="hero-badge">
                <span>✦</span> AI-Powered Search
              </div>
              <h1>
                Find Documents<br />
                <span className="gradient-text">Semantically</span>
              </h1>
              <p>
                Searching across <span className="highlight-count">{docCount} documents</span>. 
                Upload any PDF and instantly discover the most relevant documents
                using semantic embeddings.
              </p>
              <div className="hero-stats">
                <span className="stat-chip">
                  <span className="stat-chip-dot" />
                  Vector similarity search
                </span>
                <span className="stat-chip">
                  <span className="stat-chip-dot" style={{ background: "var(--accent-purple)" }} />
                  PDF extraction
                </span>
                <span className="stat-chip">
                  <span className="stat-chip-dot" style={{ background: "var(--accent-teal)" }} />
                  Instant results
                </span>
              </div>
            </header>

            {/* Search Bar */}
            <SearchBar setResults={setResults} setCount={setCount} />

            {/* Upload card */}
            <div className="upload-section">
              <div className="section-label">📁 Upload Document</div>
              <div className="glass-card">
                <Upload setResults={setResults} setCount={setCount} />
              </div>
            </div>
          </div>

          <div className="right-panel">
            {/* Results */}
            <Results results={results} count={count} />
          </div>

        </div>
      </div>

      {/* ─── Footer ─────────────────────────────────── */}
      <footer className="app-footer">
        <p>DocSearch AI · Semantic similarity powered by vector embeddings</p>
      </footer>
    </>
  );
}

export default App;