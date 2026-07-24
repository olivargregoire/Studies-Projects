# Dockerfile for Node app
FROM node:18-alpine
WORKDIR /app1

# cache dependencies
COPY package*.json ./
RUN npm install --production

# copy source
COPY . .

EXPOSE 3000
CMD ["node", "src/index.js"]