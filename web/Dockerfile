##########
## DEPS ##
##########
FROM node:16.2.0-alpine AS deps

RUN apk add yarn git python3 make g++

WORKDIR /app
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
COPY prisma ./prisma

RUN yarn --frozen-lockfile
RUN yarn build

############
## RUNNER ##
############
FROM node:16.2.0-alpine AS prod

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/dist ./
COPY --from=deps /app/package.json ./
COPY --from=deps /app/prisma ./prisma
COPY --from=deps /app/tsconfig.json ./

RUN mkdir -p ./src/steam/volumes

CMD ["yarn", "start"]

###########
## DEBUG ##
###########
FROM deps as dev

COPY .eslintrc.cjs tsconfig.json ./
CMD ["yarn", "dev"]
