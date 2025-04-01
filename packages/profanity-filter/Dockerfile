FROM oven/bun:1.0.30-slim as build

WORKDIR /app

# Copy package.json and bun.lock
COPY package.json ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build the application if needed
RUN bun build ./src/index.ts --target=bun --outdir=./dist

# Production stage
FROM oven/bun:1.0.30-slim

WORKDIR /app

# Copy built application from build stage
COPY --from=build /app/dist /app/dist
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Expose the port the app will run on
EXPOSE 3000

# Command to run the application
CMD ["bun", "dist/index.js"]
