FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run db:generate && npm run build:server && npm run build:client

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push && npm run db:seed && npm run start"]
