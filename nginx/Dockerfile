FROM node:24-alpine AS build

RUN npm install --global pnpm@11.19.0
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages/shared packages/shared
RUN pnpm --filter @bearing-factory/shared build \
  && pnpm --filter @bearing-factory/web build

FROM nginx:1.29-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 80
