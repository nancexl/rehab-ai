# Container for any host that runs Docker images (Fly.io, Nebius Serverless, Cloud Run).
# Pass NEBIUS_TOKEN_FACTORY_KEY as a runtime secret; it is never baked into the image.
FROM node:22-alpine
WORKDIR /app
COPY app-server.mjs package.json ./
COPY dist ./dist
COPY integration/liner-agent.cjs ./integration/liner-agent.cjs
ENV PORT=8080 NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b
RUN mkdir -p output && chown node:node output
EXPOSE 8080
USER node
CMD ["node", "app-server.mjs", "--host", "0.0.0.0"]
