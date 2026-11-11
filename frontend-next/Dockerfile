FROM node:22-alpine
WORKDIR /app/frontend-next
ARG BACKEND_URL=http://api:4000
ENV BACKEND_URL=${BACKEND_URL}
COPY frontend-next/package*.json ./
RUN npm ci
COPY frontend-next/ ./
COPY shared/ /app/shared/
ENV NODE_ENV=production
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
