import { useState, useEffect } from "react";

function Sidebar({ isOpen, setIsOpen, history, onHistoryClick, onDeleteHistory }) {
  const [summarizing, setSummarizing] = useState(null); // stores filename being summarized
  const [activeSummary, setActiveSummary] = useState(null); // stores the actual summary text

  const formatDate = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleHistoryItemClick = (item) => {
    onHistoryClick(item);
    if (window.innerWidth < 768) setIsOpen(false); // Close sidebar on mobile
  };

  const onNewChatLocal = () => {
    if (typeof onHistoryClick === 'function') {
      onHistoryClick(null); // Passing null to indicate new chat
    }
    if (window.innerWidth < 768) setIsOpen(false);
  };

  return (
    <div className={`chat-sidebar ${isOpen ? "open" : "closed"}`}>
      <div className="sidebar-header">
        <div className="sidebar-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}>
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>Chat History</span>
        </div>
      </div>

      <div className="new-chat-container">
        <button className="new-chat-btn" onClick={onNewChatLocal}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}>
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Chat
        </button>
      </div>

      <div className="sidebar-content">
        {!history || history.length === 0 ? (
          <div className="sidebar-empty">No recent history.</div>
        ) : (
          <div className="history-list">
            {history.map((item, i) => (
              <div 
                key={i} 
                className="history-item" 
                onClick={() => handleHistoryItemClick(item)}
                title={item.query}
              >
                <div className="history-query">{item.query}</div>
                <div className="history-date">{formatDate(item.timestamp)}</div>
                <button 
                  className="history-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteHistory(item.id);
                  }}
                  aria-label="Delete history item"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeSummary && (
        <div className="modal-overlay" onClick={() => setActiveSummary(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">AI Summary: {activeSummary.filename}</div>
              <button className="modal-close" onClick={() => setActiveSummary(null)}>✕</button>
            </div>
            <div className="modal-divider" />
            <div className="modal-text-body summary-modal-content">
              {activeSummary.text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default Sidebar;
