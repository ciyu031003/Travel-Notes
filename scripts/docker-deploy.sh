#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Travel-Notes Docker 一键部署 =="

if ! command -v docker >/dev/null 2>&1; then
  echo "错误：未检测到 Docker，请先安装 Docker。"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "错误：未检测到 docker compose 插件，请安装 Docker Compose v2。"
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已从 .env.example 生成 .env"
fi

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    tr -dc "A-Za-z0-9" </dev/urandom | head -c 48
  fi
}

ensure_secret() {
  key="$1"
  if ! grep -q "^${key}=." .env 2>/dev/null; then
    echo "${key}=$(random_hex)" >> .env
    echo "已生成 ${key}"
  fi
}

ensure_secret JWT_SECRET
ensure_secret SESSION_SECRET

if ! grep -q "^MYSQL_ROOT_PASSWORD=." .env 2>/dev/null; then
  echo "MYSQL_ROOT_PASSWORD=$(random_hex)" >> .env
  echo "已生成 MYSQL_ROOT_PASSWORD"
fi

if ! grep -q "^APP_PORT=." .env 2>/dev/null; then
  echo "APP_PORT=3000" >> .env
fi

echo "==> 构建并启动容器..."
docker compose up -d --build

echo ""
echo "==> 部署完成 =="
echo "访问地址：http://localhost:${APP_PORT:-3000}"
echo "首次访问后台初始化：http://localhost:${APP_PORT:-3000}/admin/setup"
echo "查看日志：docker compose logs -f app"
