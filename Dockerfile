# startup-next -- microservicio Node/TypeScript (Fastify) de larga duración,
# desplegado en Fly.io igual que ontology-engine (ver fly.toml). Despliegue
# manual: flyctl deploy, no hay integración Git↔Fly conectada.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 8000
CMD ["node", "dist/main.js"]
