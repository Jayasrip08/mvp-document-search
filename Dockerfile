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
COPY .env ./

# Copy Frontend build to Nginx directory
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

# Copy Nginx configuration
COPY nginx_hf.conf /etc/nginx/sites-available/default

# Copy startup script
COPY start_app.sh .
RUN chmod +x start_app.sh

# Hugging Face Spaces requirements:
# 1. Run as non-root user (UID 1000)
# 2. Permissions for directories
RUN useradd -m -u 1000 user && \
    mkdir -p /app/db /app/documents /var/log/nginx /var/lib/nginx /run/nginx && \
    chown -R user:user /app /var/log/nginx /var/lib/nginx /run/nginx

USER user

# Port 7860 is mandatory for Spaces
EXPOSE 7860

CMD ["./start_app.sh"]
