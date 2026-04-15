import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()

try:
    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini"),
        temperature=0,
        api_key=os.getenv("OPENAI_API_KEY")
    )
    print("Successfully initialized ChatOpenAI")
    
    # Test a simple prompt
    response = llm.invoke("Hello, are you working?")
    print(f"Response: {response.content}")
except Exception as e:
    print(f"Error: {e}")
