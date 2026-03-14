FROM node:20-alpine AS base

WORKDIR /app

# Copy package files — installs deps inside the container (works without local node_modules)
COPY package.json ./
# Copy lock file only if it exists (it may not be generated yet on first run)
COPY package*.json ./
RUN npm install --prefer-offline --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
