FROM node:20-bookworm-slim AS build

WORKDIR /app

# Native dependencies for packages like node-llama-cpp when needed.
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
COPY patches ./patches
RUN npm install --ignore-scripts

COPY src ./src
COPY brain ./brain
COPY limbs ./limbs
COPY limbs_staging ./limbs_staging
COPY projects ./projects
COPY memory ./memory
COPY bin ./bin
COPY README.md IMPLEMENTATION_STATUS.md RELEASE_CHECKLIST.md PILOT_GUIDE.md PILOT_QUICKSTART.md ./
RUN npx patch-package
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HATCHLING_HOME=/data
ENV HATCHLING_HINDBRAIN_BACKEND=cpu

RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/bin ./bin
COPY --from=build /app/brain ./brain
COPY --from=build /app/limbs ./limbs
COPY --from=build /app/limbs_staging ./limbs_staging
COPY --from=build /app/projects ./projects
COPY --from=build /app/memory ./memory

RUN npm prune --omit=dev

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /app/bin/hatchling

RUN mkdir -p /data && chown -R node:node /app /data
USER node

VOLUME ["/data"]
ENTRYPOINT ["/entrypoint.sh"]
CMD ["doctor", "--json"]
