FROM node:20-alpine

WORKDIR /app

COPY apps/app-helpers ./apps/app-helpers
COPY apps/app-service-ai/package.json ./apps/app-service-ai/package.json
COPY apps/app-service-ai/src ./apps/app-service-ai/src
COPY apps/app-service-ai/public ./apps/app-service-ai/public
COPY apps/app-service-ai/prompts ./apps/app-service-ai/prompts
COPY apps/app-service-ai/evals ./apps/app-service-ai/evals

WORKDIR /app/apps/app-service-ai

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
