FROM node:20-slim

# Install native build tools required by better-sqlite3 (node-gyp + python)
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependency manifests and install
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and config files needed for TypeScript build
COPY src/ ./src/
COPY tsconfig.json ./
COPY drizzle.config.ts ./

# Build TypeScript → dist/
RUN pnpm build

# Railway injects PORT at runtime; expose 3000 as the default
EXPOSE 3000

CMD ["node", "dist/cli.js", "serve"]
