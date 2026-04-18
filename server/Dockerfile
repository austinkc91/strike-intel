FROM node:20-bookworm-slim

# better-sqlite3 ships prebuilt binaries for linux-x64 glibc, which matches
# node:20-bookworm-slim. Python + build tools are only needed if the prebuilt
# is missing — keep image lean and trust the prebuilt for now.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY data ./data

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]
