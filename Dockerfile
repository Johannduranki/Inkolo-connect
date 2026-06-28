FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json ./
COPY frontend/package*.json frontend/
RUN npm --prefix frontend ci
COPY frontend frontend
RUN npm --prefix frontend run build

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY backend/package*.json backend/
RUN npm --prefix backend ci --omit=dev
COPY backend backend
COPY --from=frontend-build /app/frontend/dist frontend/dist
EXPOSE 3000
CMD ["sh", "-c", "npm --prefix backend run migrate && npm start"]
