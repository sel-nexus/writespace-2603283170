FROM --platform=$BUILDPLATFORM node:22.22.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --maxsockets=1 --no-audit --no-fund && test -f node_modules/vite/bin/vite.js
COPY . .
RUN node node_modules/vite/bin/vite.js build

FROM nginx:1.27.3-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
