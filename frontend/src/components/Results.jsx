function Results({ results, count }) {
  return (
    <div className="results">
      <h2>We found {count} similar documents</h2>

      {results.length === 0 && <p>No results yet</p>}

      {results.map((item, index) => (
        <div key={index} className="card">
          <h3>
            {item.file} — {item.similarity}% match
          </h3>

          <p>{item.text}</p>

          <a
            href={`http://127.0.0.1:8000/document/${item.file}`}
            target="_blank"
            rel="noreferrer"
          >
            📥 View / Download
          </a>
        </div>
      ))}
    </div>
  );
}

export default Results;