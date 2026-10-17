# syntax=docker/dockerfile:1
# Targets: `migrate` (drizzle-kit + sources, runs before each deploy) and the default `runner` (the app).

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# RDS CA bundle: Node does not trust it by default, and `pg` verifies the certificate with sslmode=require.
FROM base AS certs
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /rds-ca.pem

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
# NEXT_PUBLIC_* are inlined at build time, so they arrive as build args (they are publishable keys, not secrets).
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL \
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL \
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
COPY . .
RUN npm run build

# Full node_modules (drizzle-kit is a devDependency): `npx drizzle-kit migrate`.
FROM deps AS migrate
ENV NODE_EXTRA_CA_CERTS=/certs/rds-ca.pem
COPY --from=certs /rds-ca.pem /certs/rds-ca.pem
COPY . .

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_EXTRA_CA_CERTS=/certs/rds-ca.pem
RUN useradd --system --uid 1001 nextjs
COPY --from=certs /rds-ca.pem /certs/rds-ca.pem
COPY --from=build --chown=nextjs:nextjs /app/public ./public
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
