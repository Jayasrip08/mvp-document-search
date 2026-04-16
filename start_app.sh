#!/bin/bash

# Default port to 8080 if $PORT is not set (Render/Railway set this automatically)
PORT=${PORT:-8080}

# Replace the placeholder in the Nginx config with the actual port
echo "[INIT] Configuring Nginx to listen on port $PORT..."
sed -i "s/REPLACE_PORT/$PORT/g" /etc/nginx/sites-available/default

# Start Nginx in the background with a writable PID path and error logging to stdout
echo "[INIT] Starting Nginx..."
/usr/sbin/nginx -g "daemon off; pid /tmp/nginx.pid;" &

# Start the FastAPI backend
echo "[INIT] Starting FastAPI Backend on port 8000..."
cd /app/backend
uvicorn main:app --host 0.0.0.0 --port 8000
