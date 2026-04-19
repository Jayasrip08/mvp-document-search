import { useState, useEffect, useRef, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const STOP_WORDS = new Set([
  "what","where","which","when","who","how","why","are","the","for","and",
  "that","this","with","from","have","has","had","been","will","would",
  "could","should","may","can","its","not","but","all","any","each","was",
  "were","they","their","them","than","then","does","did","into","onto",
  "upon","over","under","about","after","before","between","through","per",
  "our","your","his","her","its","we","you","he","she","it","is","in","on",
  "at","to","of","a","an","or","if","so","do","be","by","as","up","out",
  "off","down","use","used","also","such","other","these","those","shall",
]);

function getBadgeClass(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

/* Build keyword regex — include query words ≥ 4 chars that are not stop words */
function buildKeywordRegex(query) {
  if (!query) return null;
  const keywords = query.split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (keywords.length === 0) return null;
  return new RegExp(`(${keywords.join("|")})`, "gi");
}

/* Highlight a plain string → React nodes with <mark> */
function highlightSpan(text, regex) {
  if (!regex || !text) return text;
  // Reset lastIndex for global regex
  regex.lastIndex = 0;
  const parts = text.split(regex);
  regex.lastIndex = 0;
  return parts.map((part, i) => {
    regex.lastIndex = 0;
    return regex.test(part)
      ? <mark key={i} className="dt-highlight">{part}</mark>
      : part;
  });
}

/* ── Line classification ─────────────────────────
   Returns: "blank" | "h1" | "h2" | "numbered" | "bullet" | "body"
*/
function classifyLine(line) {
  const t = line.trim();
  if (!t) return "blank";

  // H1: pure ALL-CAPS line (3+ chars), optionally ending with colon
  if (/^[A-Z][A-Z\s\-/&,.:]{2,}$/.test(t) && !/\d{4,}/.test(t)) return "h1";

  // H1: "ARTICLE", "SECTION", "SCHEDULE", "EXHIBIT", "ANNEX" prefix
  if (/^(ARTICLE|SECTION|SCHEDULE|EXHIBIT|ANNEX|APPENDIX|PART|CHAPTER)\b/i.test(t) && t.length < 80) return "h1";

  // H2: numbered heading like "1. DEFINITIONS" or "3.1 Termination" (short, capitalised after number)
  if (/^(\d+\.)+(\d+)?\s+[A-Z]/.test(t) && t.length < 80) {
    // Is the rest of the line mostly a title (no long sentence)?
    const rest = t.replace(/^[\d.]+\s+/, "");
    if (rest.length < 70 && (rest === rest.toUpperCase() || /^[A-Z][a-z]/.test(rest))) return "h2";
    return "numbered";
  }

  // Numbered clause body: 1. / 1.1 / (a) / (i) with longer content
  if (/^(\d+\.)+(\d+)?\s+\S/.test(t)) return "numbered";
  if (/^\([a-zA-Z]+\)\s+\S/.test(t)) return "numbered";
  if (/^[ivxlcdmIVXLCDM]+\.\s+\S/.test(t)) return "numbered"; // roman numerals

  // Bullet
  if (/^[-•*◦▸→]\s+/.test(t)) return "bullet";

  // H2: Title Case line under 70 chars with no sentence-ending punctuation mid-line
  // e.g. "Termination for Convenience", "Limitation of Liability"
  const words = t.split(/\s+/);
  const isTitle = words.length >= 2 && words.length <= 8
    && words.every(w => /^[A-Z]/.test(w) || w.length <= 3)
    && !/[,;]/.test(t) && !/\d/.test(t)
    && !t.endsWith(".");
  if (isTitle) return "h2";

  return "body";
}

/* Inline bold: wrap **text** or all-caps phrases inside body text */
function inlineBold(text, regex) {
  if (!text) return text;
  // Split on **...**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const result = [];
  parts.forEach((part, pi) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      const inner = part.slice(2, -2);
      result.push(
        <strong key={`b-${pi}`}>
          {regex ? highlightSpan(inner, regex) : inner}
        </strong>
      );
    } else {
      result.push(...(regex ? [highlightSpan(part, regex)] : [part]));
    }
  });
  return result;
}

/* ── Smart structured text renderer ─────────────── */
function FormattedText({ text, query }) {
  if (!text) return <span className="drawer-text-empty">No text content available.</span>;

  const regex = buildKeywordRegex(query);
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const kind = classifyLine(line);

    /* ── blank: collapse runs ── */
    if (kind === "blank") {
      let count = 0;
      while (i < lines.length && classifyLine(lines[i]) === "blank") { i++; count++; }
      if (count) elements.push(<div key={`sp-${i}`} className="dt-spacer" />);
      continue;
    }

    /* ── H1 heading ── */
    if (kind === "h1") {
      elements.push(
        <div key={`h1-${i}`} className="dt-h1">
          {highlightSpan(line.trim(), regex)}
        </div>
      );
      i++;
      continue;
    }

    /* ── H2 sub-heading ── */
    if (kind === "h2") {
      const t = line.trim();
      // If starts with number, split prefix
      const numMatch = t.match(/^([\d.]+)\s+(.*)/);
      if (numMatch) {
        elements.push(
          <div key={`h2-${i}`} className="dt-h2">
            <span className="dt-h2-num">{numMatch[1]}</span>
            <span>{highlightSpan(numMatch[2], regex)}</span>
          </div>
        );
      } else {
        elements.push(
          <div key={`h2-${i}`} className="dt-h2">
            {highlightSpan(t, regex)}
          </div>
        );
      }
      i++;
      continue;
    }

    /* ── numbered clause ── */
    if (kind === "numbered") {
      // Absorb continuation body lines (not blank/heading/bullet/numbered)
      const content = [line.trim()];
      i++;
      while (i < lines.length) {
        const nk = classifyLine(lines[i]);
        if (nk === "body") { content.push(lines[i].trim()); i++; }
        else break;
      }
      const full = content.join(" ");
      const m = full.match(/^((?:[\d.]+|[ivxlcdmIVXLCDM]+\.|\([a-zA-Z]+\)))\s+(.*)/s);
      if (m) {
        elements.push(
          <div key={`num-${i}`} className="dt-numbered">
            <span className="dt-num-prefix">{m[1]}</span>
            <span className="dt-num-body">{inlineBold(m[2], regex)}</span>
          </div>
        );
      } else {
        elements.push(
          <div key={`num-${i}`} className="dt-numbered">
            <span className="dt-num-body">{inlineBold(full, regex)}</span>
          </div>
        );
      }
      continue;
    }

    /* ── bullet ── */
    if (kind === "bullet") {
      const content = line.trim().replace(/^[-•*◦▸→]\s+/, "");
      elements.push(
        <div key={`bul-${i}`} className="dt-bullet">
          <span className="dt-bullet-dot">•</span>
          <span className="dt-bullet-body">{inlineBold(content, regex)}</span>
        </div>
      );
      i++;
      continue;
    }

    /* ── body: merge into paragraph ── */
    const para = [line.trim()];
    i++;
    while (i < lines.length) {
      const nk = classifyLine(lines[i]);
      if (nk === "body") { para.push(lines[i].trim()); i++; }
      else break;
    }
    const joined = para.filter(Boolean).join(" ");
    if (joined) {
      elements.push(
        <p key={`p-${i}`} className="dt-para">
          {inlineBold(joined, regex)}
        </p>
      );
    }
  }

  return <>{elements}</>;
}

/* ── Text search navigator counter ──────────────── */
function TextSearchNav({ rawText, searchTerm, matchIdx, onNav, panelRef }) {
  const total = (() => {
    if (!searchTerm || !rawText) return 0;
    const r = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return (rawText.match(r) || []).length;
  })();

  // Scroll active mark into view
  useEffect(() => {
    if (!panelRef?.current) return;
    const marks = panelRef.current.querySelectorAll("mark.text-search-active");
    if (marks[0]) marks[0].scrollIntoView({ block: "center", behavior: "smooth" });
  }, [matchIdx, panelRef]);

  if (total === 0) return <span className="text-search-count no-match">No results</span>;
  return (
    <span className="text-search-count">
      {matchIdx + 1} / {total}
      <button className="text-nav-btn" onClick={() => onNav(i => (i - 1 + total) % total)} title="Previous">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button className="text-nav-btn" onClick={() => onNav(i => (i + 1) % total)} title="Next">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </span>
  );
}

/* ── Searchable Text (plain split, no structure) ─── */
function SearchableText({ text, searchTerm, activeIdx, query }) {
  if (!text) return <span className="drawer-text-empty">No text available.</span>;
  if (!searchTerm) return <FormattedText text={text} query={query} />;

  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  let hitCount = 0;
  return (
    <p className="dt-para" style={{ whiteSpace: "pre-wrap" }}>
      {parts.map((part, i) => {
        if (regex.test(part)) {
          const isActive = hitCount++ === activeIdx;
          return (
            <mark key={i} className={`text-search-match${isActive ? " text-search-active" : ""}`}>
              {part}
            </mark>
          );
        }
        return part;
      })}
    </p>
  );
}

const CLAUSE_COLORS = {
  "Payment Terms":               { bg: "rgba(16,185,129,0.12)",  color: "#10b981" },
  "Termination for Convenience": { bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
  "Termination for Cause":       { bg: "rgba(239,68,68,0.1)",    color: "#f87171" },
  "Indemnification":             { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b" },
  "Limitation of Liability":     { bg: "rgba(245,158,11,0.1)",   color: "#fbbf24" },
  "Auto-Renewal":                { bg: "rgba(139,92,246,0.12)",  color: "#a78bfa" },
  "Confidentiality / NDA":       { bg: "rgba(59,130,246,0.12)",  color: "#60a5fa" },
  "Force Majeure":               { bg: "rgba(107,114,128,0.12)", color: "#9ca3af" },
  "Governing Law":               { bg: "rgba(20,184,166,0.12)",  color: "#2dd4bf" },
  "Dispute Resolution":          { bg: "rgba(236,72,153,0.12)",  color: "#f472b6" },
  "Intellectual Property":       { bg: "rgba(99,102,241,0.12)",  color: "#818cf8" },
  "Non-Compete":                 { bg: "rgba(234,179,8,0.12)",   color: "#eab308" },
  "Warranties":                  { bg: "rgba(34,197,94,0.12)",   color: "#22c55e" },
};

function DocumentDrawer({ item, query, onClose, onFocusDoc }) {
  const [matchIndex, setMatchIndex]   = useState(0);
  const [allPages, setAllPages]       = useState([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [activeTab, setActiveTab]     = useState("pdf");
  const [clauseCopied, setClauseCopied] = useState(false);
  const [isVisible, setIsVisible]     = useState(false);

  // Search-within-text state
  const [textSearch, setTextSearch]   = useState("");
  const [textMatchIdx, setTextMatchIdx] = useState(0);
  const textPanelRef = useRef(null);

  // Summary + Clauses state
  const [summaryData, setSummaryData]   = useState(null);
  const [clausesData, setClausesData]   = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingClauses, setLoadingClauses] = useState(false);

  /* Animate in */
  useEffect(() => {
    if (item) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [item]);

  /* Reset state when document changes */
  useEffect(() => {
    if (!item) return;
    setMatchIndex(0);
    setClauseCopied(false);
    setActiveTab("pdf");
    setAllPages(item.matching_pages || []);
    setTextSearch("");
    setTextMatchIdx(0);
    setSummaryData(null);
    setClausesData(null);

    if (!query || !item.file) { setLoadingPages(false); return; }

    setLoadingPages(true);
    const encoded = encodeURIComponent(item.file);
    const q = encodeURIComponent(query);
    fetch(`${API_URL}/document-pages/${encoded}?query=${q}`)
      .then(r => r.json())
      .then(data => {
        if (data.pages?.length > 0) setAllPages(data.pages.map(p => p.page));
      })
      .catch(() => {})
      .finally(() => setLoadingPages(false));
  }, [item?.file, query]);

  /* Keyboard shortcuts */
  useEffect(() => {
    if (!item) return;
    const onKey = (e) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight" && allPages.length > 1)
        setMatchIndex(p => (p + 1) % allPages.length);
      if (e.key === "ArrowLeft" && allPages.length > 1)
        setMatchIndex(p => (p - 1 + allPages.length) % allPages.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, allPages.length]);

  /* Lazy-load summary when tab first opened */
  useEffect(() => {
    if (activeTab !== "summary" || !item?.file || summaryData) return;
    setLoadingSummary(true);
    fetch(`${API_URL}/summarize/${encodeURIComponent(item.file)}`)
      .then(r => r.json())
      .then(data => setSummaryData(data))
      .catch(() => setSummaryData({ error: "Failed to load summary." }))
      .finally(() => setLoadingSummary(false));
  }, [activeTab, item?.file]);

  /* Lazy-load clauses when tab first opened */
  useEffect(() => {
    if (activeTab !== "clauses" || !item?.file || clausesData) return;
    setLoadingClauses(true);
    fetch(`${API_URL}/clauses/${encodeURIComponent(item.file)}`)
      .then(r => r.json())
      .then(data => setClausesData(data.clauses || []))
      .catch(() => setClausesData([]))
      .finally(() => setLoadingClauses(false));
  }, [activeTab, item?.file]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 280); // wait for slide-out animation
  };

  if (!item) return null;

  const currentPage   = allPages[matchIndex] || item.page || 1;
  const totalMatches  = allPages.length;
  const badgeClass    = getBadgeClass(item.similarity);

  const searchTerms = (query || "")
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .slice(0, 3).join(" ");

  const pdfUrl = `${API_URL}/document/${encodeURIComponent(item.file)}` +
    `#page=${currentPage}` +
    (searchTerms ? `?search=${encodeURIComponent(searchTerms)}` : "");

  const handleCopyClause = () => {
    const text = item.full_text || item.text || "";
    navigator.clipboard.writeText(`[${item.file} — Page ${currentPage}]\n\n${text}`);
    setClauseCopied(true);
    setTimeout(() => setClauseCopied(false), 2000);
  };

  return (
    <div className={`doc-drawer ${isVisible ? "open" : ""}`}>

      {/* ── Header ─────────────────────────────────── */}
      <div className="drawer-header">
        <div className="drawer-file-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div className="drawer-file-meta">
          <div className="drawer-filename" title={item.file}>{item.file}</div>
          <div className="drawer-file-sub">
            <span className={`drawer-score-badge ${badgeClass}`}>
              {item.similarity}% match
            </span>
            <span className="drawer-page-hint">Page {currentPage}</span>
          </div>
        </div>
        <button className="drawer-close-btn" onClick={handleClose} aria-label="Close drawer">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* ── Tab bar ───────────────────────────────── */}
      <div className="drawer-tabs">
        <button
          className={`drawer-tab${activeTab === "pdf" ? " active" : ""}`}
          onClick={() => setActiveTab("pdf")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          PDF
        </button>
        <button
          className={`drawer-tab${activeTab === "text" ? " active" : ""}`}
          onClick={() => setActiveTab("text")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <line x1="17" y1="10" x2="3" y2="10"/>
            <line x1="21" y1="6" x2="3" y2="6"/>
            <line x1="21" y1="14" x2="3" y2="14"/>
            <line x1="17" y1="18" x2="3" y2="18"/>
          </svg>
          Text
        </button>

        <button
          className={`drawer-tab${activeTab === "summary" ? " active" : ""}`}
          onClick={() => setActiveTab("summary")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Insights
        </button>

        <button
          className={`drawer-tab${activeTab === "clauses" ? " active" : ""}`}
          onClick={() => setActiveTab("clauses")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          Clauses
        </button>

        {/* Page navigator lives in the tab bar right side */}
        <div className="drawer-page-nav">
          <button
            className="drawer-nav-btn"
            onClick={() => setMatchIndex(p => (p - 1 + totalMatches) % totalMatches)}
            disabled={totalMatches <= 1 || loadingPages}
            title="Previous match (←)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="drawer-page-counter">
            {loadingPages ? "…" : `${matchIndex + 1} / ${totalMatches || 1}`}
          </span>
          <button
            className="drawer-nav-btn"
            onClick={() => setMatchIndex(p => (p + 1) % totalMatches)}
            disabled={totalMatches <= 1 || loadingPages}
            title="Next match (→)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Content ───────────────────────────────── */}
      <div className="drawer-content">
        {activeTab === "summary" ? (
          <div className="drawer-insights-panel">
            {loadingSummary ? (
              <div className="drawer-ai-loading">
                <div className="sidebar-spinner" />
                <span>Analyzing document…</span>
              </div>
            ) : summaryData?.error ? (
              <div className="drawer-insights-error">{summaryData.error}</div>
            ) : summaryData ? (
              <>
                {summaryData.structured?.overview && (
                  <div className="insights-section">
                    <div className="insights-section-title">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Overview
                    </div>
                    <p className="insights-overview">{summaryData.structured.overview}</p>
                  </div>
                )}

                {summaryData.entities?.parties?.length > 0 && (
                  <div className="insights-section">
                    <div className="insights-section-title">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      Key Parties
                    </div>
                    <div className="insights-entity-grid">
                      {summaryData.entities.parties.map((p, i) => (
                        <div key={i} className="insights-entity-chip">
                          <span className="entity-name">{p.name}</span>
                          {p.role && <span className="entity-role">{p.role}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(summaryData.entities?.dates?.length > 0 || summaryData.entities?.deadlines?.length > 0) && (
                  <div className="insights-section">
                    <div className="insights-section-title">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      Dates &amp; Deadlines
                    </div>
                    <div className="insights-list">
                      {[...(summaryData.entities.dates||[]), ...(summaryData.entities.deadlines||[])].map((d, i) => (
                        <div key={i} className="insights-list-item">
                          <span className="insights-list-value">{d.value}</span>
                          <span className="insights-list-context">{d.context}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {summaryData.entities?.amounts?.length > 0 && (
                  <div className="insights-section">
                    <div className="insights-section-title">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                      Dollar Amounts
                    </div>
                    <div className="insights-list">
                      {summaryData.entities.amounts.map((a, i) => (
                        <div key={i} className="insights-list-item">
                          <span className="insights-list-value amount">{a.value}</span>
                          <span className="insights-list-context">{a.context}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {summaryData.structured?.obligations?.length > 0 && (
                  <div className="insights-section">
                    <div className="insights-section-title">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      Key Obligations
                    </div>
                    <ul className="insights-bullet-list">
                      {summaryData.structured.obligations.map((o, i) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {summaryData.structured?.risk_flags?.length > 0 && (
                  <div className="insights-section">
                    <div className="insights-section-title risk">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      Risk Flags
                    </div>
                    <ul className="insights-bullet-list risk">
                      {summaryData.structured.risk_flags.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : null}
          </div>
        ) : activeTab === "clauses" ? (
          <div className="drawer-clauses-panel">
            {loadingClauses ? (
              <div className="drawer-ai-loading">
                <div className="sidebar-spinner" />
                <span>Extracting clauses…</span>
              </div>
            ) : clausesData && clausesData.length > 0 ? (
              <>
                <div className="clauses-count">{clausesData.length} clause type{clausesData.length !== 1 ? "s" : ""} detected</div>
                <div className="clauses-list">
                  {clausesData.map((c, i) => {
                    const style = CLAUSE_COLORS[c.type] || { bg: "rgba(107,114,128,0.12)", color: "#9ca3af" };
                    return (
                      <div key={i} className="clause-card">
                        <span className="clause-tag-pill" style={{ background: style.bg, color: style.color }}>
                          {c.type}
                        </span>
                        {c.excerpt && <p className="clause-excerpt">"{c.excerpt}"</p>}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : clausesData !== null ? (
              <div className="drawer-insights-error">No specific clause types detected.</div>
            ) : null}
          </div>
        ) : activeTab === "pdf" ? (
          <iframe
            key={item.file}
            src={pdfUrl}
            className="drawer-pdf-iframe"
            title="Document PDF"
          />
        ) : (
          <div className="drawer-text-panel" ref={textPanelRef}>
            {/* ── Mini search bar ── */}
            <div className="drawer-text-search-bar">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="drawer-text-search-input"
                placeholder="Search in text…"
                value={textSearch}
                onChange={e => { setTextSearch(e.target.value); setTextMatchIdx(0); }}
              />
              {textSearch && (
                <TextSearchNav
                  rawText={item.full_text || item.text || ""}
                  searchTerm={textSearch}
                  matchIdx={textMatchIdx}
                  onNav={setTextMatchIdx}
                  panelRef={textPanelRef}
                />
              )}
              {textSearch && (
                <button className="drawer-text-search-clear" onClick={() => { setTextSearch(""); setTextMatchIdx(0); }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>

            <div className="drawer-text-label">Extracted clause — Page {currentPage}</div>
            <div className="drawer-text-body">
              {textSearch ? (
                <SearchableText
                  text={item.full_text || item.text || ""}
                  searchTerm={textSearch}
                  activeIdx={textMatchIdx}
                  query={query}
                />
              ) : (
                <FormattedText text={item.full_text || item.text || ""} query={query} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────── */}
      <div className="drawer-footer">
        {onFocusDoc && (
          <button
            className="drawer-footer-btn accent focus-doc-btn"
            onClick={() => onFocusDoc(item.file)}
            title="Ask questions only about this document"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Ask about this PDF
          </button>
        )}

        <a
          href={`${API_URL}/document/${encodeURIComponent(item.file)}`}
          download
          className="drawer-footer-btn"
          title="Download PDF"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download PDF
        </a>

        <a
          href={`${API_URL}/document/${encodeURIComponent(item.file)}`}
          target="_blank"
          rel="noreferrer"
          className="drawer-footer-btn accent"
          title="Open full PDF in new tab"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Open Full PDF
        </a>
      </div>

      {/* Keyboard hint */}
      {totalMatches > 1 && (
        <div className="drawer-keyboard-hint">
          ← → arrow keys to navigate matches · Esc to close
        </div>
      )}
    </div>
  );
}

export default DocumentDrawer;
