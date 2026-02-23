# Stage 1 — build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2 — install backend prod deps
FROM node:20-alpine AS backend-deps
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Stage 3 — production image
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=backend-deps /app/node_modules ./node_modules
COPY backend/src ./src
COPY backend/package.json .
COPY --from=frontend-build /app/frontend/dist ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
