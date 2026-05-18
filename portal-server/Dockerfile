FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY portal-server ./portal-server

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "portal-server/server.mjs"]
