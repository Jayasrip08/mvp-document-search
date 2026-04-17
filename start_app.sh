#!/bin/bash

# Start Nginx in the background
echo "[INIT] Starting Nginx on port 7860..."
/usr/sbin/nginx -g "daemon off;" &

# Start the FastAPI backend
echo "[INIT] Starting FastAPI Backend on port 8000..."
cd /app/backend
uvicorn main:app --host 0.0.0.0 --port 8000
