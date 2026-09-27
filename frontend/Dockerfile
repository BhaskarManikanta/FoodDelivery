FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Runs the Vite dev server (not a production build) so this matches the
# rest of the project's "docker compose up --build for local dev" story.
# For a real deployment, build a static bundle with `vite build` and serve
# it from nginx instead.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
