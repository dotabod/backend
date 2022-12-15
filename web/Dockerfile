##########
## DEPS ##
##########
FROM node:16.2.0-alpine AS deps

RUN apk add yarn git

WORKDIR /app
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
COPY prisma ./prisma

RUN \
    if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i; \
    else echo "Lockfile not found." && exit 1; \
    fi

#############
## BUILDER ##
#############
FROM node:16.2.0-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app .
COPY . .

RUN yarn build

############
## RUNNER ##
############
FROM node:16.2.0-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./
COPY --from=deps /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

RUN mkdir -p ./src/steam/volumes

CMD ["yarn", "start"]