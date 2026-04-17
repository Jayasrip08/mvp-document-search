import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";

const API_URL = import.meta.env.VITE_API_URL || "/api";

/* ── helpers ─────────────────────────────────────── */
function getBadgeClass(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

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

function markKeywords(markdown, query) {
  if (!query || !markdown) return markdown || "";
  const keywords = query.split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (keywords.length === 0) return markdown;
  const regex = new RegExp(`\\b(${keywords.join("|")})\\b`, "gi");
  return markdown.replace(regex, "<mark>$1</mark>");
}

/* Replace [N] (not followed by () with clickable citation superscript */
function renderCitations(text) {
  return text.replace(/\[(\d+)\](?!\()/g, (_, n) =>
    `<sup class="cite-badge" data-idx="${n}">[${n}]</sup>`
  );
}

function highlightText(text, query) {
  if (!query || !text) return text;
  const keywords = query.split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (keywords.length === 0) return text;
  const regex = new RegExp(`(${keywords.join("|")})`, "gi");
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) => {
        const isMatch = keywords.some(kw => new RegExp(`^${kw}$`, "i").test(part));
        return isMatch ? <mark key={i}>{part}</mark> : part;
      })}
    </span>
  );
}

/* ── Score Tooltip Badge ─────────────────────────── */
function ScoreBadge({ score, badgeClass, label }) {
  return (
    <span className={`tooltip-wrapper`}>
      <span className={`source-score-badge ${badgeClass}`}>{score}%</span>
      <span className="tooltip-popup">
        <strong>Semantic similarity: {score}%</strong><br />
        Measures how closely this passage matches your query using AI vector embeddings.
        {score >= 75 ? " Strong match." : score >= 50 ? " Moderate match." : " Weak match."}
      </span>
    </span>
  );
}

/* ── Source Card ─────────────────────────────────── */
function SourceCard({ item, idx, onExpand, onCompare, compareItems, query }) {
  const badgeClass = getBadgeClass(item.similarity);
  const isInCompare = compareItems.some(c => c.file === item.file);

  return (
    <div
      className={`source-card${isInCompare ? " compare-selected" : ""}`}
      onClick={() => onExpand(item)}
      title="Click to open document"
    >
      <div className="source-card-top">
        <div className="source-card-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {idx !== undefined && (
            <span className="source-card-num">[{idx + 1}]</span>
          )}
          <div className="source-card-name">{item.file}</div>
          {item.page && <div className="source-card-pages">Page {item.page}</div>}
        </div>
        <ScoreBadge score={item.similarity} badgeClass={badgeClass} />
      </div>

      {item.text && (
        <div className="source-snippet">
          {highlightText(item.text, query)}
        </div>
      )}

      {/* Compare button */}
      <button
        className={`source-compare-btn${isInCompare ? " active" : ""}`}
        onClick={e => { e.stopPropagation(); onCompare(item); }}
        title={isInCompare ? "Remove from comparison" : "Add to comparison"}
      >
        {isInCompare ? (
          <>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Added
          </>
        ) : (
          <>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="8" height="18" rx="1"/>
              <rect x="13" y="3" width="8" height="18" rx="1"/>
            </svg>
            Compare
          </>
        )}
      </button>
    </div>
  );
}

/* ── Copy button ─────────────────────────────────── */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      className={`msg-action-btn${copied ? " copied" : ""}`}
      onClick={handleCopy}
      title="Copy response"
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
          Copied
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

/* ── Thumbs Feedback ─────────────────────────────── */
function FeedbackButtons({ query, answer }) {
  const [voted, setVoted] = useState(null); // 1 or -1

  const handleVote = async (vote) => {
    if (voted !== null) return;
    setVoted(vote);
    try {
      await fetch(`${API_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, answer, vote }),
      });
    } catch (_) {}
  };

  return (
    <div className="feedback-btns">
      <button
        className={`msg-action-btn${voted === 1 ? " voted-up" : ""}`}
        onClick={() => handleVote(1)}
        disabled={voted !== null}
        title="Helpful"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill={voted === 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
        </svg>
      </button>
      <button
        className={`msg-action-btn${voted === -1 ? " voted-down" : ""}`}
        onClick={() => handleVote(-1)}
        disabled={voted !== null}
        title="Not helpful"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill={voted === -1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/>
          <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
        </svg>
      </button>
      {voted !== null && (
        <span className="feedback-thanks">Thanks!</span>
      )}
    </div>
  );
}

/* ── Message Row ─────────────────────────────────── */
function MessageRow({ msg, onExpand, onCompare, compareItems, query, onFollowUp }) {
  const isUser = msg.role === "user";
  const bodyRef = useRef(null);

  /* Handle citation badge clicks via event delegation */
  useEffect(() => {
    if (!bodyRef.current || !msg.results) return;
    const handler = (e) => {
      const badge = e.target.closest(".cite-badge");
      if (!badge) return;
      const idx = parseInt(badge.dataset.idx, 10) - 1;
      if (!isNaN(idx) && msg.results[idx]) {
        onExpand(msg.results[idx]);
      }
    };
    const el = bodyRef.current;
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [msg.results, onExpand]);

  const processedContent = renderCitations(
    markKeywords(msg.content || "", query)
  );

  return (
    <div className={`message-row${isUser ? " user" : ""}`}>
      <div className={`msg-avatar${isUser ? " user" : " ai"}`}>
        {isUser ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </div>

      <div className="msg-body">
        {isUser ? (
          <div className="user-bubble">{msg.content}</div>
        ) : (
          <>
            {msg.loading ? (
              <div className="ai-typing-dots"><span /><span /><span /></div>
            ) : (
              <>
                <div className="ai-text-content" ref={bodyRef}>
                  {msg.streaming ? (
                    <>
                      <ReactMarkdown rehypePlugins={[rehypeRaw]}>{processedContent}</ReactMarkdown>
                      <span className="streaming-cursor" />
                    </>
                  ) : (
                    <ReactMarkdown rehypePlugins={[rehypeRaw]}>{processedContent}</ReactMarkdown>
                  )}
                </div>

                {/* Action bar + Sources + Follow-ups — only after streaming */}
                {!msg.streaming && (
                  <>
                    {msg.content && (
                      <div className="msg-actions">
                        <CopyButton text={msg.content} />
                        <FeedbackButtons query={query} answer={msg.content} />
                      </div>
                    )}

                    {msg.results && msg.results.length > 0 && (
                      <div className="sources-section">
                        <div className="sources-label">Sources &amp; References</div>
                        <div className="sources-row">
                          {msg.results.slice(0, 6).map((res, i) => (
                            <SourceCard
                              key={i}
                              item={res}
                              idx={i}
                              onExpand={onExpand}
                              onCompare={onCompare}
                              compareItems={compareItems}
                              query={query}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.followups && msg.followups.length > 0 && (
                      <div className="followup-section">
                        <div className="followup-label">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                          Follow-up questions
                        </div>
                        <div className="followup-chips">
                          {msg.followups.map((q, i) => (
                            <button key={i} className="followup-chip" onClick={() => onFollowUp(q)}>
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Comparison Overlay ──────────────────────────── */
import { diffWords } from "diff";

function ComparisonOverlay({ items, onClose, query }) {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    if (items.length === 2) requestAnimationFrame(() => setIsVisible(true));
    else setIsVisible(false);
  }, [items.length]);

  useEffect(() => {
    if (items.length < 2) return;
    const onKey = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 260);
  };

  if (items.length < 2) return null;

  const [a, b] = items;
  const textA = a.full_text || a.text || "";
  const textB = b.full_text || b.text || "";
  const diffs = diffWords(textA, textB);

  const renderDiff = (side) =>
    diffs.map((part, i) => {
      if (side === "left"  && part.removed) return <mark key={i} className="diff-removed">{part.value}</mark>;
      if (side === "right" && part.added)   return <mark key={i} className="diff-added">{part.value}</mark>;
      if (part.added   && side === "left")  return null;
      if (part.removed && side === "right") return null;
      return <span key={i}>{part.value}</span>;
    });

  return (
    <div className={`comparison-overlay${isVisible ? " open" : ""}`}>
      {/* ── Top bar ── */}
      <div className="comparison-header">
        <div className="comparison-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="8" height="18" rx="1"/>
            <rect x="13" y="3" width="8" height="18" rx="1"/>
          </svg>
          Document Comparison
        </div>

        <div className="comparison-legend">
          <span className="legend-pill legend-removed">
            <span className="legend-dot" />
            Unique to left
          </span>
          <span className="legend-pill legend-added">
            <span className="legend-dot" />
            Unique to right
          </span>
        </div>

        <button className="comparison-close" onClick={handleClose} title="Close (Esc)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* ── Side-by-side panels ── */}
      <div className="comparison-panels">
        {[a, b].map((item, side) => (
          <div key={side} className="comparison-panel">
            <div className="comparison-panel-header">
              <div className={`comparison-panel-badge`}>
                {side === 0 ? "A" : "B"}
              </div>
              <div className="comparison-panel-meta">
                <div className="comparison-panel-name" title={item.file}>{item.file}</div>
                <div className="comparison-panel-sub">
                  {item.matching_pages?.length > 0
                    ? `Pages: ${item.matching_pages.slice(0,3).join(", ")}${item.matching_pages.length > 3 ? "…" : ""}`
                    : ""}
                </div>
              </div>
              <span className={`source-score-badge ${getBadgeClass(item.similarity)}`}>
                {item.similarity}% match
              </span>
            </div>
            <div className="comparison-panel-body">
              {renderDiff(side === 0 ? "left" : "right")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Export CSV ──────────────────────────────────── */
function exportToCSV(messages, query) {
  const rows = [["Document", "Page", "Match %", "Excerpt", "Query"]];
  messages.forEach(msg => {
    if (msg.results && msg.results.length > 0) {
      msg.results.forEach(r => {
        rows.push([
          r.file || "",
          r.page || "",
          (r.similarity || 0) + "%",
          (r.text || "").replace(/"/g, '""').replace(/\n/g, " "),
          (query || "").replace(/"/g, '""'),
        ]);
      });
    }
  });
  const csv = rows.map(row => row.map(v => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clauses-${(query || "results").slice(0, 30).replace(/\s+/g, "-")}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Results ─────────────────────────────────────── */
function Results({ messages, isSearching, query, onDocumentOpen, onFollowUp }) {
  const [compareItems, setCompareItems] = useState([]);

  const handleCompare = useCallback((item) => {
    setCompareItems(prev => {
      const already = prev.some(c => c.file === item.file);
      if (already) return prev.filter(c => c.file !== item.file);
      if (prev.length >= 2) return [prev[1], item]; // replace oldest
      return [...prev, item];
    });
  }, []);

  if (!messages || messages.length === 0) return null;
  const hasResults = messages.some(m => m.results && m.results.length > 0);

  return (
    <>
      <div className="chat-messages-container">
        {hasResults && (
          <div className="export-row">
            <button className="btn-export" onClick={() => exportToCSV(messages, query)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export CSV
            </button>
          </div>
        )}

        <div className="messages-list">
          {messages.map((msg, i) => (
            <MessageRow
              key={i}
              msg={msg}
              onExpand={onDocumentOpen}
              onCompare={handleCompare}
              compareItems={compareItems}
              query={query}
              onFollowUp={onFollowUp}
            />
          ))}
        </div>
      </div>

      {/* Compare toast hint */}
      {compareItems.length === 1 && (
        <div className="compare-hint-bar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/>
          </svg>
          Select one more source to compare
          <button className="compare-hint-cancel" onClick={() => setCompareItems([])}>✕</button>
        </div>
      )}

      <ComparisonOverlay
        items={compareItems}
        onClose={() => setCompareItems([])}
        query={query}
      />
    </>
  );
}

export default Results;
