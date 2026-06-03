FROM node:20-alpine

WORKDIR /app

COPY apps/app-helpers ./apps/app-helpers
COPY apps/creative-writer/package.json ./apps/creative-writer/package.json
COPY apps/creative-writer/src ./apps/creative-writer/src
COPY apps/creative-writer/public ./apps/creative-writer/public
COPY apps/creative-writer/prompts ./apps/creative-writer/prompts
COPY apps/creative-writer/evals ./apps/creative-writer/evals

WORKDIR /app/apps/creative-writer

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
