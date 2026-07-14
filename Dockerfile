# Minimal multi-stage image for the pocketbase-mcp stdio MCP server.
# The builder compiles TypeScript -> dist/, the release stage runs node dist/index.js.

# ---- Builder: install ALL deps and compile TypeScript ----
FROM node:22-alpine AS builder
WORKDIR /app

# Install deps (incl. dev) from the lockfile.
# --ignore-scripts skips the package.json "prepare" hook (which runs tsc) at a
# point where the sources have not been copied yet.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy sources and build to dist/.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Release: slim production runtime ----
FROM node:22-alpine AS release
WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only.
# --ignore-scripts is REQUIRED: package.json's "prepare" script runs tsc, but
# tsc is a devDependency and is absent here, so prepare would otherwise fail.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Bring in the compiled output from the builder stage.
COPY --from=builder /app/dist ./dist

# Run as the built-in non-root user.
USER node

# stdio MCP server: JSON-RPC on stdout, human logs on stderr.
# Connection settings come from the environment at runtime, e.g.:
#   docker run -i --rm \
#     -e POCKETBASE_URL=http://host.docker.internal:8090 \
#     -e POCKETBASE_ADMIN_EMAIL=admin@example.com \
#     -e POCKETBASE_ADMIN_PASSWORD=secret \
#     pocketbase-mcp
ENTRYPOINT ["node", "dist/index.js"]
