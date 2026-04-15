import os
import requests
from dotenv import load_dotenv

load_dotenv(override=True)

api_key = os.getenv("OPENAI_API_KEY")
model = os.getenv("OPENAI_MODEL_NAME")

url = "https://api.openai.com/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {api_key}"
}
data = {
    "model": model,
    "messages": [
        {"role": "user", "content": "Hello!"}
    ]
}

print(f"Testing key: {api_key[:15]}...")
try:
    response = requests.post(url, headers=headers, json=data, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response Body: {response.text}")
except Exception as e:
    print(f"Request failed: {e}")
