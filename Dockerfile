FROM node:20-slim

# Install dependencies for better-sqlite3 (native module)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application
COPY server.js ./
COPY public/ ./public/
COPY contracts/ ./contracts/

# Create data directory
RUN mkdir -p /data

# Environment
ENV NODE_ENV=production
ENV IGNOSHASHI_DATA_DIR=/data

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "const p=process.env.PORT||3000;require('http').get('http://localhost:'+p+'/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

CMD ["node", "server.js"]
