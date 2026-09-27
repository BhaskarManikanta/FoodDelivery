FROM node:20-alpine

WORKDIR /app

# Build context is the repo root (see docker-compose.yml) so shared/
# (error handler) can be copied alongside this service.
COPY shared ./shared
COPY gateway/package*.json ./gateway/
RUN npm install --prefix gateway

COPY gateway ./gateway

EXPOSE 8080

CMD ["node", "gateway/src/server.js"]
