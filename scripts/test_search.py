from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma


embeddings = OpenAIEmbeddings()

db = Chroma(persist_directory="../db", embedding_function=embeddings)

query = "service agreement termination clause"

results = db.similarity_search(query, k=3)

for r in results:
    print("----")
    print(r.metadata)
    print(r.page_content[:300])