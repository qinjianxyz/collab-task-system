FROM oven/bun:1.3.8 AS build

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

RUN bun run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash

COPY --from=build /app /app

ENV PATH="/root/.bun/bin:${PATH}"
ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "./scripts/container-entrypoint.sh"]
