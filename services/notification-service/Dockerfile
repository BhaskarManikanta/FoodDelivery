FROM node:20-alpine

WORKDIR /app

# Build context is the repo root (see docker-compose.yml) so that the
# shared/ folder (event envelope + idempotency helpers) can be copied
# alongside this service and referenced via a relative import.
COPY shared ./shared
COPY services/notification-service/package*.json ./services/notification-service/
RUN npm install --prefix services/notification-service

COPY services/notification-service ./services/notification-service

EXPOSE 4005

CMD ["node", "services/notification-service/src/server.js"]
