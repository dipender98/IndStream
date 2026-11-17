FROM node:20-alpine
WORKDIR /app
COPY src ./src
COPY index.js ./index.js
COPY package.json ./package.json
WORKDIR /app
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
