# =============================================================================
# Frontend Dockerfile — Development mode (Vite dev server)
# =============================================================================
# Runs `npm run dev` with Vite bound to 0.0.0.0 so the container is reachable.
# The /api proxy in vite.config.ts forwards to the gateway container.
#
# Build args:
#   NODE_ENV — set to "development" (default)
#
# Used by docker-compose target: frontend
# For production, switch CMD to: npm run build && npm run preview
# =============================================================================

FROM node:20-alpine AS dev

WORKDIR /app

# Copy dependency manifests first (layer-cached if unchanged)
COPY package.json package-lock.json ./

# Clean install — respects package-lock.json for reproducibility
RUN npm ci

# Copy the rest of the source
COPY . .

EXPOSE 3000

# --host 0.0.0.0 → bind to all interfaces so Docker port-mapping works
# Without this, Vite only listens on 127.0.0.1 inside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
