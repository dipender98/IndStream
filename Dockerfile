FROM node:20-alpine
WORKDIR /app
COPY src ./src
COPY public ./public
COPY assets ./assets
COPY index.js ./index.js
COPY package.json ./package.json
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]