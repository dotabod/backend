# First stage: Install dependencies and cache them
FROM node:19.4-alpine AS deps

RUN apk add git

WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

FROM deps AS prisma

WORKDIR /app

# Generate prisma schema
COPY prisma ./prisma

RUN yarn prisma generate --schema ./prisma/postgres.prisma && \
    yarn prisma generate --schema ./prisma/mongo.prisma || \
    true

# Copy the cached dependencies and build the application
FROM prisma AS builder

ARG COMMIT_HASH
ENV COMMIT_HASH $COMMIT_HASH

WORKDIR /app

COPY tsconfig.json ./tsconfig.json
COPY src ./src

RUN yarn build
RUN rm -rf node_modules

## PROD ##
FROM node:19.4-alpine AS prod

WORKDIR /app

COPY --from=builder /app/dist ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=prisma /app/prisma ./prisma

RUN mkdir -p ./src/steam/volumes

CMD ["yarn", "start"]

## DEV ##
FROM node:19.4-alpine AS dev

ARG COMMIT_HASH
ENV COMMIT_HASH $COMMIT_HASH

WORKDIR /app

COPY tsconfig.json ./tsconfig.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=prisma /app/prisma ./prisma

RUN mkdir -p ./src/steam/volumes

CMD ["yarn", "dev"]
