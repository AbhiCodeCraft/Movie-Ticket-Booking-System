FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY tests ./tests
COPY scripts ./scripts
EXPOSE 3000
USER node
CMD ["node","scripts/container-start.js"]
