FROM node:20-alpine

WORKDIR /app

# Build context is the repo root (see docker-compose.yml) so that the
# shared/ folder (event envelope + idempotency helpers) can be copied
# alongside this service and referenced via a relative import.
COPY shared ./shared
COPY services/restaurant-service/package*.json ./services/restaurant-service/
RUN npm install --prefix services/restaurant-service

COPY services/restaurant-service ./services/restaurant-service

EXPOSE 4002

CMD ["node", "services/restaurant-service/src/server.js"]
