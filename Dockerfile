FROM node:20-alpine AS builder
WORKDIR /app

RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000

COPY package.json package-lock.json ./
RUN npm ci

# Để trống = dùng địa chỉ production trong .env.production (api.smartracking.io.vn).
# Muốn trỏ chỗ khác thì truyền --build-arg REACT_APP_API_BASE_URL=... khi build.
ARG REACT_APP_API_BASE_URL=
ARG REACT_APP_WS_URL=
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL
ENV REACT_APP_WS_URL=$REACT_APP_WS_URL

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# File trong /etc/nginx/templates được image nginx thay biến môi trường rồi ghi ra conf.d/default.conf.
# BACKEND_UPSTREAM = nơi nginx chuyển /api, /ws, /uploads tới (tên service backend trong docker-compose).
ENV BACKEND_UPSTREAM=backend:3000
# Tự đọc máy chủ DNS từ /etc/resolv.conf → biến NGINX_LOCAL_RESOLVERS dùng trong nginx.conf.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
