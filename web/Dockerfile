#################
#      BASE     #
#################
FROM node:19.4-alpine as base

RUN apk add --no-cache git

WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile --production


#################
#     PRISMA    #
#################
FROM base AS prisma

RUN yarn install --frozen-lockfile

COPY prisma ./prisma
RUN yarn prisma generate --schema ./prisma/postgres.prisma 
RUN test -f ./prisma/postgres.prisma \
    && yarn prisma generate --schema ./prisma/mongo.prisma \
    || true


#################
#    BUILDER    #
#################
FROM prisma AS builder

COPY tsconfig.json ./tsconfig.json
COPY src ./src

RUN yarn build


#################
#      DEV      #
#################
FROM node:19.4-alpine as dev

ARG COMMIT_HASH
ENV COMMIT_HASH $COMMIT_HASH

WORKDIR /app
COPY tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p ./src/steam/volumes

CMD ["yarn", "dev"]

#################
#     PROD      #
#################
FROM node:19.4-alpine as prod

ARG COMMIT_HASH
ENV COMMIT_HASH $COMMIT_HASH

LABEL org.opencontainers.image.source="https://github.com/dotabod/backend"
LABEL org.opencontainers.image.version=$COMMIT_HASH

WORKDIR /app
COPY tsconfig.json ./tsconfig.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=builder /app/dist ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p ./src/steam/volumes

CMD ["yarn", "start"]
