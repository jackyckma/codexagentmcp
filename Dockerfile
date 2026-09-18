FROM node:22-alpine AS build
LABEL "language"="nodejs"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine
LABEL "language"="nodejs"
ENV NODE_ENV=production PORT=8080 TRANSPORT=http
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/src/index.js"]
