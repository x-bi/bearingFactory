FROM node:24-alpine AS build

RUN npm install --global pnpm@11.19.0
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY apps/server apps/server
COPY packages/shared packages/shared
RUN pnpm --filter @bearing-factory/shared build \
  && pnpm --filter @bearing-factory/server prisma:generate \
  && pnpm --filter @bearing-factory/server build

FROM node:24-alpine AS runtime

RUN npm install --global pnpm@11.19.0
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /workspace /app

EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @bearing-factory/server prisma:bootstrap && pnpm --filter @bearing-factory/server prisma:seed && node apps/server/dist/main.js"]
