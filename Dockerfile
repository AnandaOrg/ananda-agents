# One Dockerfile, two images: `--target api` and `--target web`. docker-compose.yml builds both.
FROM node:24-alpine AS base
RUN npm install -g pnpm@11.8.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# ---------- build everything ----------
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
# Next bakes rewrites in at build time: the web server proxies /api/* to the api service.
ARG API_URL=http://api:4020
ENV API_URL=$API_URL NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- API: production dependencies + compiled output ----------
FROM base AS api
RUN pnpm install --frozen-lockfile --prod --filter @ananda-agents/api...
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle
WORKDIR /app/apps/api
ENV NODE_ENV=production PORT=4020
EXPOSE 4020
USER node
# Apply migrations, seed demo data only into an empty database, then start.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/seed.js && node dist/main.js"]

# ---------- web: Next.js standalone server ----------
FROM node:24-alpine AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3020 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public apps/web/public
EXPOSE 3020
USER node
CMD ["node", "apps/web/server.js"]
