import { useState } from "react";
import Upload from "./components/Upload";
import Results from "./components/Results";
import "./styles.css";

function App() {
  const [results, setResults] = useState([]);
  const [count, setCount]     = useState(0);

  return (
    <div className="page-wrapper">
      <div className="container">
        {/* Header */}
        <header className="app-header">
          <div className="app-logo">🔍</div>
          <h1>DocSearch AI</h1>
          <p>Upload a PDF and instantly discover similar documents using AI-powered semantic search.</p>
        </header>

        {/* Upload */}
        <div className="glass-card" style={{ padding: "28px 32px" }}>
          <Upload setResults={setResults} setCount={setCount} />
        </div>

        {/* Results */}
        <Results results={results} count={count} />
      </div>
    </div>
  );
}

export default App;