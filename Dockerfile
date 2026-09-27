FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/data
ENV UPLOAD_DIR=/data/uploads

EXPOSE 4000

CMD ["node", "server/index.js"]
