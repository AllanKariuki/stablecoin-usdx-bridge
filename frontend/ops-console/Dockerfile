# Serves the static build. Build first: pnpm --filter ops-console build
FROM node:lts-slim
WORKDIR /app
RUN npm install -g serve
COPY dist/ /app/
EXPOSE 80
CMD ["serve", "-s", "/app", "-l", "80"]
