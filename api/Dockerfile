FROM node:20-alpine
WORKDIR /app
COPY api/package*.json ./api/
RUN cd api && npm ci --omit=dev
COPY api ./api
COPY web ./web
EXPOSE 3000
WORKDIR /app/api
CMD ["node", "src/server.js"]
