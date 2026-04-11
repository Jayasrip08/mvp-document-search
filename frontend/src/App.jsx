import { useState, useEffect } from "react";
import SearchBar from "./components/SearchBar";
import Results from "./components/Results";
import Sidebar from "./components/Sidebar";
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
  const [showSidebar, setShowSidebar] = useState(false);

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

  const clearResults = () => {
    setResults([]);
    setCount(0);
  };

  return (
    <div className="app-main-wrapper">
      <Sidebar isOpen={showSidebar} setIsOpen={setShowSidebar} />

      <div className={`app-main-content ${showSidebar ? "sidebar-open" : ""}`}>
        {/* ─── Navbar ─────────────────────────────────── */}
        <nav className="navbar">
          <div className="navbar-brand">
            <button 
              className="sidebar-toggle-btn" 
              onClick={() => setShowSidebar(s => !s)}
              aria-label="Toggle Sidebar"
            >
              ☰
            </button>
            <div className="navbar-title" style={{ marginLeft: '4px' }}>DocSearch AI</div>
          </div>

          <div className="navbar-actions">
            <button
              className="btn-danger-outline"
              onClick={handleReset}
              disabled={isResetting}
              title="Wipe database and start fresh"
              style={{ padding: '6px 12px', fontSize: '0.75rem', height: '32px' }}
            >
              {isResetting ? "Cleaning..." : "Reset"}
            </button>

            {/* Dark / Light toggle */}
            <button
              id="theme-toggle-btn"
              className="theme-toggle"
              onClick={() => setDark(d => !d)}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              <span className="theme-toggle-icon">
                {dark ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                  </svg>
                )}
              </span>
              <div className="theme-toggle-track" aria-hidden="true">
                <div className="theme-toggle-thumb" />
              </div>
            </button>
          </div>
        </nav>

        {/* ─── Chat Layout Main Content ───────────────── */}
        <div className="chat-layout">
          
          {/* Scrollable Area */}
          <div className="chat-scroll-area">
            {results.length === 0 ? (
              <div className="chat-welcome-wrapper">
                <div className="chat-welcome">
                  <div className="chat-welcome-icon">
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      <line x1="11" y1="8" x2="11" y2="14"></line>
                      <line x1="8" y1="11" x2="14" y2="11"></line>
                    </svg>
                  </div>
                  <h2>DocSearch Semantic Engine</h2>
                  <p>Discover insights across your <span className="highlight-count">{docCount} documents</span> using enterprise-grade vector embeddings. Attach a PDF or enter a query.</p>
                </div>
              </div>
            ) : (
              <div className="chat-results-area">
                <Results results={results} count={count} clearResults={clearResults} />
              </div>
            )}
          </div>

          {/* Fixed Input Area */}
          <div className="chat-input-area">
            <div className="chat-input-wrapper">
              <SearchBar setResults={setResults} setCount={setCount} />
            </div>
            <footer className="chat-footer">
              <p>DocSearch AI can provide similar documents from your library. Check your results.</p>
            </footer>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;