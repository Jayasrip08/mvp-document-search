import { useState, useEffect, useRef } from "react";
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
  const [messages, setMessages] = useState([]);
  const [lastQuery, setLastQuery] = useState("");
  const [history, setHistory] = useState([]);

  const [dark,    setDark]    = useState(getInitialTheme);
  const [docCount, setDocCount] = useState(0);
  const [isResetting, setIsResetting] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [serverOnline, setServerOnline] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

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

const API_URL = import.meta.env.VITE_API_URL || "/api";

  /* Fetch library stats and history */
  const fetchData = async () => {
    try {
      const statsRes = await fetch(`${API_URL}/stats`);
      const statsData = await statsRes.json();
      setDocCount(statsData.document_count || 0);
      setServerOnline(true);

      const historyRes = await fetch(`${API_URL}/history`);
      const historyData = await historyRes.json();
      setHistory(historyData);
    } catch (err) {
      setServerOnline(false);
    }
  };

  /* Poll until backend is ready (model load takes ~90s on restart) */
  useEffect(() => {
    let retryTimer = null;
    const tryConnect = async () => {
      try {
        const res = await fetch(`${API_URL}/stats`);
        const data = await res.json();
        setDocCount(data.document_count || 0);
        setServerOnline(true);
        const histRes = await fetch(`${API_URL}/history`);
        const histData = await histRes.json();
        setHistory(histData);
      } catch {
        setServerOnline(false);
        retryTimer = setTimeout(tryConnect, 3000); // retry every 3 seconds
      }
    };
    tryConnect();
    return () => { if (retryTimer) clearTimeout(retryTimer); };
  }, []);

  const handleReset = async () => {
    if (!window.confirm("Are you sure you want to clean the entire database? This will delete all indexed documents and source files.")) return;

    setIsResetting(true);
    try {
      const res = await fetch(`${API_URL}/reset`, { method: "POST" });
      const data = await res.json();
      if (data.status === "success") {
        setMessages([]);
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
    setMessages([]);
    setHasSearched(false);
  };

  const performSearch = async (queryText, file = null) => {
    if (!queryText.trim() && !file) return;

    const userQuery = file ? `Uploaded: ${file.name}${queryText ? ` - ${queryText}` : ""}` : queryText.trim();
    setLastQuery(userQuery);
    setHasSearched(true);
    setIsSearching(true);

    // Add user message and a placeholder for AI
    const newUserMsg = { role: "user", content: userQuery };
    const newAiMsg = { role: "assistant", content: null, loading: true };
    setMessages(prev => [...prev, newUserMsg, newAiMsg]);

    try {
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        
        const searchRes = await fetch(`${API_URL}/search`, {
          method: "POST",
          body: formData,
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const searchResults = searchData.results || [];
          const aiResponseText = `I have indexed **${file.name}** and found ${searchResults.length} similar snippets in your library. How can I help you with this document?`;
          
          setMessages(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.role === "assistant") {
              updated[lastIdx] = {
                role: "assistant",
                content: aiResponseText,
                results: searchResults,
                loading: false
              };
            }
            return updated;
          });
        }
      } else {
        const fetchSearch = async () => {
          try {
            const res = await fetch(`${API_URL}/text-search`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: userQuery }),
            });
            if (res.ok) {
              const data = await res.json();
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (updated[lastIdx]?.role === "assistant") {
                  updated[lastIdx] = { ...updated[lastIdx], results: data.results || [] };
                }
                return updated;
              });
            }
          } catch (e) { console.error("Search fetch failed", e); }
        };

        const fetchChat = async () => {
          try {
            const res = await fetch(`${API_URL}/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: userQuery }),
            });
            if (res.ok) {
              const data = await res.json();
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (updated[lastIdx]?.role === "assistant") {
                  updated[lastIdx] = { 
                    ...updated[lastIdx], 
                    content: data.answer, 
                    sources: data.sources || [],
                    loading: false 
                  };
                }
                return updated;
              });
            }
          } catch (e) {
            console.error("Chat fetch failed", e);
            setMessages(prev => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (updated[lastIdx]?.role === "assistant") {
                updated[lastIdx] = { ...updated[lastIdx], content: "Sorry, I encountered an error generating a response.", loading: false };
              }
              return updated;
            });
          }
        };

        fetchSearch();
        fetchChat();
      }
      
      fetchData(); // Refresh history/stats
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleHistoryAction = (item) => {
    if (!item) {
      setMessages([]);
      setHasSearched(false);
      setLastQuery("");
      return;
    }

    if (typeof item === 'string') {
      performSearch(item);
      return;
    }

    setHasSearched(true);
    setLastQuery(item.query);
    
    let parsedSources = [];
    try {
      parsedSources = typeof item.sources === 'string' ? JSON.parse(item.sources) : (item.sources || []);
    } catch(e) { console.error("Source parse failed", e); }

    const hasRichResults = parsedSources.length > 0 && typeof parsedSources[0] === 'object' && parsedSources[0].file;

    const historicalMessages = [
      { role: "user", content: item.query },
      { 
        role: "assistant", 
        content: item.answer || "No response saved.", 
        results: hasRichResults ? parsedSources : [],
        sources: !hasRichResults ? parsedSources : [],
        loading: false 
      }
    ];
    setMessages(historicalMessages);
  };

  const handleDeleteHistory = async (itemId) => {
    if (!window.confirm("Are you sure you want to delete this history item?")) return;
    try {
      const res = await fetch(`${API_URL}/history/${itemId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert("Error: " + (data.message || "Failed to delete history item."));
      }
    } catch (err) {
      console.error("Delete history failed:", err);
      alert("Failed to reach server.");
    }
  };

  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSearching]);

  return (
    <div className="app-main-wrapper">
      <Sidebar 
        isOpen={showSidebar} 
        setIsOpen={setShowSidebar} 
        history={history} 
        onHistoryClick={handleHistoryAction}
        onDeleteHistory={handleDeleteHistory}
        onRefresh={fetchData}
      />

      <div className={`app-main-content ${showSidebar ? "sidebar-open" : ""}`}>
        {!serverOnline && (
          <div style={{
            background: "linear-gradient(90deg, #f59e0b, #f97316)",
            color: "#fff",
            textAlign: "center",
            padding: "10px 16px",
            fontSize: "0.85rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            letterSpacing: "0.02em"
          }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#fff", opacity: 0.8, animation: "pulse 1.2s ease-in-out infinite" }} />
            Connecting to server — please wait, the AI model is loading (~60 seconds)…
          </div>
        )}

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
            {!hasSearched ? (
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
                <Results 
                  messages={messages} 
                  clearResults={clearResults} 
                  isSearching={isSearching}
                  query={lastQuery}
                />
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Fixed Input Area */}
          <div className="chat-input-area">
            <div className="chat-input-wrapper">
              <SearchBar 
                setLastQuery={setLastQuery}
                fetchData={fetchData}
                performSearch={performSearch}
              />
            </div>
            <footer className="chat-footer">
              <p>DocSearch AI can provide answers based on your linked documents.</p>
            </footer>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;