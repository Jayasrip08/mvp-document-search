import { useState } from "react";
import Upload from "./components/Upload";
import Results from "./components/Results";
import "./styles.css";

function App() {
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);

  return (
    <div className="container">
      <h1>📄 Document Similarity Search</h1>

      <Upload setResults={setResults} setCount={setCount} />

      <Results results={results} count={count} />
    </div>
  );
}

export default App;