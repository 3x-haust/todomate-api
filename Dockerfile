FROM node:24-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src ./src
COPY tsconfig.json tsconfig.build.json ./
RUN npm run build

ENV NODE_ENV=production
ENV TODOMATE_PORT=3000
EXPOSE 3000

CMD ["node", "dist/main.js"]
