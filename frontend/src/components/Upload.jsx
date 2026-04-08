import { useState } from "react";

function Upload({ setResults, setCount }) {
  const [file, setFile] = useState(null);

  const handleUpload = async () => {
    if (!file) {
      alert("Please upload a PDF");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("http://127.0.0.1:8000/search", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    setResults(data.results);
    setCount(data.count);
  };

  return (
    <div className="upload-box">
      <input
        type="file"
        accept=".pdf"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <button onClick={handleUpload}>Upload & Search</button>
    </div>
  );
}

export default Upload;