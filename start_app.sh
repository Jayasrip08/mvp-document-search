#!/bin/bash

# Fix global Nginx config to allow running as non-root
echo "[INIT] Fixing global Nginx configuration..."
sed -i 's/^user/#user/' /etc/nginx/nginx.conf
sed -i 's|pid /run/nginx.pid;|pid /tmp/nginx.pid;|g' /etc/nginx/nginx.conf

# Replace the placeholder in the Nginx site config with the actual port
echo "[INIT] Configuring Nginx to listen on port $PORT..."
sed -i "s/REPLACE_PORT/$PORT/g" /etc/nginx/sites-available/default

# Start Nginx in the background
echo "[INIT] Starting Nginx..."
/usr/sbin/nginx -g "daemon off;" &

# Start the FastAPI backend
echo "[INIT] Starting FastAPI Backend on port 8000..."
cd /app/backend
uvicorn main:app --host 0.0.0.0 --port 8000
