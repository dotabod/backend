#################
#      BASE     #
#################
FROM node:19.4-alpine as base

ARG BUILD_CONTEXT

RUN apk add --no-cache git

WORKDIR /app
COPY package.json yarn.lock* ./

WORKDIR /app/$BUILD_CONTEXT
COPY ./$BUILD_CONTEXT/package.json ./$BUILD_CONTEXT/yarn.lock* ./

WORKDIR /app
RUN yarn install --frozen-lockfile --production


#################
#     PRISMA    #
#################
FROM base AS builder

RUN yarn install --frozen-lockfile

WORKDIR /app/$BUILD_CONTEXT
COPY ./$BUILD_CONTEXT/prisma ./prisma

RUN yarn prisma generate --schema ./prisma/postgres.prisma
RUN test -f ./prisma/postgres.prisma \
    && yarn prisma generate --schema ./prisma/mongo.prisma \
    || true


# #################
# #    BUILDER    #
# #################
# FROM prisma AS builder

COPY ./$BUILD_CONTEXT/tsconfig.json ./tsconfig.json
COPY ./$BUILD_CONTEXT/src ./src

RUN yarn build


#################
#      DEV      #
#################
FROM node:19.4-alpine as dev

ARG BUILD_CONTEXT
ENV COMMIT_HASH $COMMIT_HASH

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

WORKDIR /app/$BUILD_CONTEXT
COPY --from=builder /app/$BUILD_CONTEXT/node_modules* ./node_modules
COPY --from=builder /app/$BUILD_CONTEXT/package.json ./
COPY --from=builder /app/$BUILD_CONTEXT/tsconfig.json ./
COPY --from=builder /app/$BUILD_CONTEXT/prisma ./prisma


RUN mkdir -p ./src/steam/volumes

CMD ["yarn", "dev"]

#################
#     PROD      #
#################
FROM node:19.4-alpine as prod

ARG BUILD_CONTEXT
ENV COMMIT_HASH $COMMIT_HASH

LABEL org.opencontainers.image.source="https://github.com/dotabod/backend"
LABEL org.opencontainers.image.version=$COMMIT_HASH

WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

WORKDIR /app/$BUILD_CONTEXT
COPY --from=base /app/$BUILD_CONTEXT/node_modules* ./node_modules
COPY --from=builder /app/$BUILD_CONTEXT/dist ./
COPY --from=builder /app/$BUILD_CONTEXT/package.json ./
COPY --from=builder /app/$BUILD_CONTEXT/tsconfig.json ./
COPY --from=builder /app/$BUILD_CONTEXT/prisma ./prisma

RUN mkdir -p ./src/steam/volumes

CMD ["yarn", "start"]
