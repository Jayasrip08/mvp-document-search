# Stage 1: Build
FROM node:20-slim AS build

WORKDIR /app

# Install dependencies
COPY frontend/package*.json ./
RUN npm install

# Build the app
COPY frontend/ ./
# We pass the production API URL at build time or use a runtime config
# For simplicity with Vite, we'll build it and we can override at runtime if we used a script, 
# but here we'll assume the environment variable VITE_API_URL is set or defaults to relative /api
RUN npm run build

# Stage 2: Production
FROM nginx:stable-alpine

# Copy build files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
