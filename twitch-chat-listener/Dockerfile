##########
## DEPS ##
##########
FROM --platform=linux/amd64 node:16.2.0-alpine AS deps

RUN apk add yarn git

WORKDIR /app
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
COPY prisma ./prisma

RUN yarn --frozen-lockfile

#############
## BUILDER ##
#############
FROM --platform=linux/amd64 node:16.2.0-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app .
COPY . .

RUN yarn build

############
## RUNNER ##
############
FROM --platform=linux/amd64 node:16.2.0-alpine AS prod

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./
COPY --from=deps /app/package.json ./
COPY --from=deps /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./

CMD ["yarn", "start"]

###########
## DEBUG ##
###########
FROM deps as dev

COPY .eslintrc.cjs tsconfig.json ./
CMD ["yarn", "dev"]
