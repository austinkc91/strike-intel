FROM node:22-slim

RUN apt-get update && apt-get install -y \
    gdal-bin \
    python3-gdal \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ src/

RUN npx tsc

EXPOSE 3001

CMD ["node", "dist/index.js"]
