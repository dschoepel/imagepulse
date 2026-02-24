# Stage 1 — build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
# All three manifests + root lock file are required for npm ci to resolve the workspace graph
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
# Install only frontend workspace deps (skips better-sqlite3 native build)
RUN npm ci --workspace=frontend
COPY frontend/ ./frontend/
RUN npm run build --workspace=frontend

# Stage 2 — install backend prod deps
FROM node:20-alpine AS backend-deps
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
RUN npm ci --workspace=backend --omit=dev

# Stage 3 — production image
FROM node:20-alpine AS production
WORKDIR /app
# With hoisted workspaces all deps land in root node_modules
COPY --from=backend-deps /app/node_modules ./node_modules
COPY backend/src ./src
COPY backend/package.json .
COPY --from=frontend-build /app/frontend/dist ./public
ENV NODE_ENV=production
EXPOSE 3579
CMD ["node", "src/index.js"]
