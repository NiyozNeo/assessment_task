FROM node:20-alpine

WORKDIR /app

# Install OpenSSL - required for Prisma
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma client
RUN npm install
RUN npx prisma generate
# Removed: RUN npx prisma migrate dev - This happens at runtime now

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]