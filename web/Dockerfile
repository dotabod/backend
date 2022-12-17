##########
## DEPS ##
##########
FROM node:slim AS deps

WORKDIR /app
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
COPY prisma ./prisma

RUN apt-get update && apt-get install yarn git make g++ -y
RUN yarn --frozen-lockfile

#############
## BUILDER ##
#############
FROM node:slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app .
COPY . .

RUN yarn build

############
## RUNNER ##
############
FROM node:slim AS prod

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
