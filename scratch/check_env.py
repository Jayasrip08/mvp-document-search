import os
from dotenv import load_dotenv

# Use override=True to make sure we get the latest from .env
load_dotenv(override=True)

key = os.getenv("OPENAI_API_KEY")
if key:
    print(f"API Key found: {key[:15]}...{key[-5:]}")
else:
    print("API Key not found in environment")

model = os.getenv("OPENAI_MODEL_NAME")
print(f"Model Name: {model}")
