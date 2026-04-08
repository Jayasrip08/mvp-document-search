import fitz  # PyMuPDF

def extract_text(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""

    for page in doc:
        text += page.get_text()

    return text


# TEST
if __name__ == "__main__":
    sample = "../documents/sample.pdf"
    print(extract_text(sample)[:500])