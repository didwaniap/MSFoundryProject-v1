FROM node:20-alpine

WORKDIR /app

COPY apps/app-helpers ./apps/app-helpers
COPY apps/retail-copilot/package.json ./apps/retail-copilot/package.json
COPY apps/retail-copilot/src ./apps/retail-copilot/src
COPY apps/retail-copilot/public ./apps/retail-copilot/public
COPY apps/retail-copilot/prompts ./apps/retail-copilot/prompts
COPY apps/retail-copilot/evals ./apps/retail-copilot/evals

WORKDIR /app/apps/retail-copilot

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
