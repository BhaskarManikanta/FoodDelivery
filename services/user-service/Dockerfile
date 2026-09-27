FROM node:20-alpine

WORKDIR /app

# Build context is the repo root (see docker-compose.yml) so shared/
# (error handler) can be copied alongside this service.
COPY shared ./shared
COPY services/user-service/package*.json ./services/user-service/
RUN npm install --prefix services/user-service

COPY services/user-service ./services/user-service

EXPOSE 4001

CMD ["node", "services/user-service/src/server.js"]
