import { useState, useEffect } from "react";
import Upload from "./components/Upload";
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
        <div className="container">

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
              Upload any PDF and instantly discover the most relevant documents
              in your library using state-of-the-art semantic embeddings.
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

          {/* Upload card */}
          <div className="upload-section">
            <div className="section-label">📁 Upload Document</div>
            <div className="glass-card">
              <Upload setResults={setResults} setCount={setCount} />
            </div>
          </div>

          {/* Results */}
          <Results results={results} count={count} />
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