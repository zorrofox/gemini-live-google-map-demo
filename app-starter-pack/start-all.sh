#!/bin/bash
# 一键启动前后端（开发用）
# 需在 app-starter-pack/service/ 目录下运行

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$SCRIPT_DIR/service"

echo "======================================"
echo "  Google Maps Demo 启动脚本"
echo "======================================"
echo ""

# 加载环境变量
if [ -f "$SCRIPT_DIR/.env" ]; then
    echo "✓ 加载环境变量..."
    export $(cat "$SCRIPT_DIR/.env" | grep -v '^#' | xargs)
else
    echo "✗ 错误：找不到 .env 文件（应在 app-starter-pack/.env）"
    exit 1
fi

# 构建前端
echo "✓ 构建前端..."
echo "VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_API_KEY" > "$SERVICE_DIR/frontend/.env"
npm --prefix "$SERVICE_DIR/frontend" run build

# 启动后端（后台运行）
echo "✓ 启动后端服务 (端口 8000)..."
cd "$SERVICE_DIR"
GOOGLE_API_KEY=$GOOGLE_API_KEY \
PROJECT_NUMBER=$PROJECT_NUMBER \
FIRESTORE_PROJECT=$FIRESTORE_PROJECT \
poetry run uvicorn server:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo ""
echo "✓ 服务已启动："
echo "  后端: http://localhost:8000"
echo "  按 Ctrl+C 停止"
echo ""

# 清理：退出时停止后端
trap "echo '停止后端服务...'; kill $BACKEND_PID 2>/dev/null" EXIT

wait $BACKEND_PID
