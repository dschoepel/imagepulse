# Stage 1 — build frontend (always runs on build machine's native arch, no QEMU)
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-build
WORKDIR /app
# All three manifests + root lock file are required for npm ci to resolve the workspace graph
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
# Install only frontend workspace deps (skips better-sqlite3 native build)
RUN npm ci --workspace=frontend
COPY frontend/ ./frontend/
RUN npm run build --workspace=frontend

# Stage 2 — install backend prod deps (always runs on build machine's native arch, no QEMU)
FROM --platform=$BUILDPLATFORM node:20-alpine AS backend-deps
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
# --ignore-scripts skips native module compilation; better-sqlite3 is compiled
# for the correct target architecture in the production stage below
RUN npm ci --workspace=backend --omit=dev --ignore-scripts

# Stage 3 — production image (target arch)
FROM node:20-alpine AS production
WORKDIR /app
# Build tools required to compile the better-sqlite3 native addon for the target arch
RUN apk add --no-cache python3 make g++
COPY --from=backend-deps /app/node_modules ./node_modules
COPY backend/src ./src
# Root package.json needed so npm can locate the workspace node_modules for rebuild
COPY package.json .
# Compile better-sqlite3 for the target architecture, then strip build tools
RUN npm rebuild better-sqlite3 && apk del --purge python3 make g++
# Backend package.json last — overwrites root package.json so Node.js picks up
# "type": "module" and the correct entry point at runtime
COPY backend/package.json .
COPY --from=frontend-build /app/frontend/dist ./public
ENV NODE_ENV=production
EXPOSE 3579
CMD ["node", "src/index.js"]
