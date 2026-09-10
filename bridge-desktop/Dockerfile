FROM node:24-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY scripts/printer-bridge.mjs scripts/spoolman-bridge.mjs ./scripts/
COPY out/printer-core.js ./out/
RUN ./node_modules/.bin/esbuild scripts/printer-bridge.mjs --bundle --platform=node --format=cjs --target=node22 --define:import.meta.url='""' --outfile=bridge.cjs

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /build/bridge.cjs ./bridge.cjs
COPY bridge-desktop/container.mjs ./container.mjs
USER node
CMD ["node", "container.mjs"]
