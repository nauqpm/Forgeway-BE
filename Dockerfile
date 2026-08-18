# ---- Stage 1: Build ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: Runtime ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV UPLOAD_DIR=/app/uploads
RUN mkdir -p /app/uploads

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force && apk add --no-cache curl

COPY --from=builder /app/dist ./dist

EXPOSE 1786
CMD ["node", "dist/src/main.js"]
