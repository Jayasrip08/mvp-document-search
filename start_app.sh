#!/bin/bash

# Replace the placeholder in the master Nginx config with the actual port
echo "[INIT] Configuring Nginx to listen on port $PORT..."
sed -i "s/REPLACE_PORT/$PORT/g" /etc/nginx/nginx.conf

# Start Nginx in the background
echo "[INIT] Starting Nginx..."
/usr/sbin/nginx -g "daemon off;" &

# Start the FastAPI backend
echo "[INIT] Starting FastAPI Backend on port 8000..."
cd /app/backend
uvicorn main:app --host 0.0.0.0 --port 8000
