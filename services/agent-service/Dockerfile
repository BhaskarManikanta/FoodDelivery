FROM node:20-alpine

WORKDIR /app

# Build context is the repo root (see docker-compose.yml) so that the
# shared/ folder (event envelope + idempotency helpers) can be copied
# alongside this service and referenced via a relative import.
COPY shared ./shared
COPY services/agent-service/package*.json ./services/agent-service/
RUN npm install --prefix services/agent-service

COPY services/agent-service ./services/agent-service

EXPOSE 4004

CMD ["node", "services/agent-service/src/server.js"]
