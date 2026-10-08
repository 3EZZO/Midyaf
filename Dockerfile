FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run db:generate && npm run build:server && npm run build:client

EXPOSE 4000

# T-01: start the built server only. Startup never pushes the schema or seeds;
# the container keeps the DATABASE_URL it is given.
CMD ["node", "dist/server/src/index.js"]
