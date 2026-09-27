FROM node:20-alpine

WORKDIR /app

# Build context is the repo root (see docker-compose.yml) so that the
# shared/ folder (event envelope + idempotency helpers) can be copied
# alongside this service and referenced via a relative import.
COPY shared ./shared
COPY services/order-service/package*.json ./services/order-service/
RUN npm install --prefix services/order-service

COPY services/order-service ./services/order-service

EXPOSE 4003

CMD ["node", "services/order-service/src/server.js"]
