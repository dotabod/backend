# change with the Node.js version of your choice
ARG NODE_VERSION="18.12.1"

# change with the Linux Alpine version of your choice
ARG ALPINE_VERSION="3.17"

##########
## DEPS ##
##########
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS deps
# install OpenSSL 1.1.x, needed for Linux Alpine 3.17+
RUN apk update && apk add openssl1.1-compat

RUN apk add yarn git

WORKDIR /app
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
COPY prisma ./prisma

RUN yarn --frozen-lockfile

#############
## BUILDER ##
#############
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder
# install OpenSSL 1.1.x, needed for Linux Alpine 3.17+
RUN apk update && apk add openssl1.1-compat

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app .
COPY . .

RUN yarn build

############
## RUNNER ##
############
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS prod
# install OpenSSL 1.1.x, needed for Linux Alpine 3.17+
RUN apk update && apk add openssl1.1-compat

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./
COPY --from=deps /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

RUN mkdir -p ./src/steam/volumes

CMD ["yarn", "start"]

###########
## DEBUG ##
###########
FROM deps as dev

COPY .eslintrc.cjs tsconfig.json ./
CMD ["yarn", "dev"]
