# Build Frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Final Stage
FROM python:3.13-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    build-essential \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Backend code
COPY backend/main.py ./backend/

# Copy Frontend build to Nginx directory
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

# Copy Nginx configuration
COPY nginx_full.conf /etc/nginx/nginx.conf

# Copy startup script
COPY start_app.sh .
RUN chmod +x start_app.sh

# Deployment requirements (Works for Render, Railway, and Hugging Face):
# 1. Run as non-root user (UID 1000)
# 2. Permissions for directories
RUN useradd -m -u 1000 user && \
    mkdir -p /app/db /app/documents /var/log/nginx /var/lib/nginx /run/nginx /etc/nginx/sites-available && \
    chown -R user:user /app /var/log/nginx /var/lib/nginx /run/nginx /etc/nginx

USER user

# Default port placeholder (Render provides $PORT at runtime)
EXPOSE 8080

CMD ["./start_app.sh"]
