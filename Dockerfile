# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY prisma ./prisma
RUN npm install

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps ./apps
COPY prisma ./prisma
RUN npx prisma generate
RUN npm run build -w @seo-ops/web
RUN npm run build -w @seo-ops/server

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY prisma ./prisma
RUN npm install --omit=dev

COPY --from=build /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build /app/node_modules/@prisma /app/node_modules/@prisma
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/prisma ./prisma
COPY scripts/docker-entrypoint.mjs /docker-entrypoint.mjs
RUN npx prisma generate

# Do not bake GSC credentials into the image.
EXPOSE 3000
ENTRYPOINT ["node", "/docker-entrypoint.mjs"]
CMD ["web"]
