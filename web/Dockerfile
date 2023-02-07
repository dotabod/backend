# First stage: Install dependencies and cache them
FROM --platform=linux/amd64 node:19.4-alpine AS deps

RUN apk add yarn git

WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

FROM deps AS prisma

WORKDIR /app

# Generate prisma schema
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma

RUN yarn prisma generate --schema ./prisma/postgres.prisma
RUN yarn prisma generate --schema ./prisma/mongo.prisma; exit 0
RUN rm -rf node_modules

# Copy the cached dependencies and build the application
FROM prisma AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=prisma /app/prisma ./prisma
COPY locales ./locales
COPY tsconfig.json ./tsconfig.json
COPY src ./src

RUN yarn build
RUN rm -rf node_modules

## PROD ##
FROM --platform=linux/amd64 node:19.4-alpine AS prod

WORKDIR /app

COPY --from=builder /app/dist ./
COPY --from=builder /app/locales ./locales
COPY --from=builder /app/tsconfig.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=prisma /app/prisma ./prisma

RUN mkdir -p ./src/steam/volumes

CMD ["yarn", "start"]

## DEV ##
FROM --platform=linux/amd64 node:19.4-alpine AS dev

WORKDIR /app

COPY --from=builder /app/locales ./locales
COPY --from=builder /app/tsconfig.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=prisma /app/prisma ./prisma

RUN mkdir -p ./src/steam/volumes

CMD ["yarn", "dev"]
