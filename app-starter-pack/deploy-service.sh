#!/bin/bash
# Deploy Service to Google Cloud Run for Glasses Integration

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${PROJECT_ID:-"juyun-juyunlifang"}
SERVICE_NAME="restaurant-guide-service"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo -e "${BLUE}======================================"
echo "  Restaurant Guide Service 部署"
echo "  (for Smart Glasses Integration)"
echo "======================================${NC}"
echo ""

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo -e "${BLUE}✓ 加载环境变量...${NC}"
    export $(grep -v '^#' .env | xargs)
else
    echo -e "${RED}✗ 错误：找不到 .env 文件${NC}"
    exit 1
fi

# Check if required environment variables are set
if [ -z "$GOOGLE_API_KEY" ]; then
    echo -e "${RED}✗ 错误：GOOGLE_API_KEY 未设置${NC}"
    exit 1
fi

if [ -z "$PROJECT_NUMBER" ]; then
    echo -e "${RED}✗ 错误：PROJECT_NUMBER 未设置${NC}"
    exit 1
fi

echo -e "${YELLOW}项目 ID: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}服务名称: ${SERVICE_NAME}${NC}"
echo -e "${YELLOW}区域: ${REGION}${NC}"
echo -e "${YELLOW}镜像: ${IMAGE_NAME}${NC}"
echo ""

# Check if gcloud is authenticated
echo -e "${BLUE}✓ 检查 gcloud 认证...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${RED}✗ 错误：没有活跃的 gcloud 认证${NC}"
    echo "请运行: gcloud auth login"
    exit 1
fi

# Set the project
echo -e "${BLUE}✓ 设置 gcloud 项目...${NC}"
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo -e "${BLUE}✓ 启用必需的 API...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build the Docker image
echo -e "${BLUE}✓ 构建 Docker 镜像...${NC}"
docker build -f service/Dockerfile -t ${IMAGE_NAME} .

# Push the image to GCR
echo -e "${BLUE}✓ 推送镜像到 GCR...${NC}"
docker push ${IMAGE_NAME}

# Deploy to Cloud Run
echo -e "${BLUE}✓ 部署到 Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME} \
    --region ${REGION} \
    --memory "4Gi" \
    --timeout=3600 \
    --min-instances=1 \
    --max-instances=1 \
    --session-affinity \
    --set-env-vars "GOOGLE_API_KEY=${GOOGLE_API_KEY}" \
    --set-env-vars "PROJECT_NUMBER=${PROJECT_NUMBER}" \
    --set-env-vars "VERTEXAI=true" \
    --allow-unauthenticated

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}======================================"
    echo "  ✅ 部署成功！"
    echo "======================================${NC}"
    echo ""
    
    # Get the service URL
    SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format="value(status.url)")
    if [ ! -z "$SERVICE_URL" ]; then
        echo -e "${GREEN}🌐 Service URL:${NC}"
        echo -e "${GREEN}   ${SERVICE_URL}${NC}"
        echo ""
        echo -e "${YELLOW}📱 WebSocket 连接地址（给眼镜端使用）：${NC}"
        echo -e "${YELLOW}   ${SERVICE_URL/https/wss}/ws${NC}"
        echo ""
        echo -e "${YELLOW}💡 示例连接（带参数）：${NC}"
        echo -e "   ${SERVICE_URL/https/wss}/ws?voice_name=Charon&text_only=false"
        echo ""
        echo -e "${YELLOW}🔍 健康检查：${NC}"
        echo -e "   curl ${SERVICE_URL}/api/health"
        echo ""
        echo -e "${BLUE}📋 可用的语音选项：${NC}"
        echo -e "   - Aoede (女声，优雅)"
        echo -e "   - Charon (男声，沉稳)"
        echo -e "   - Fenrir (男声，有力)"
        echo -e "   - Puck (男声，活泼)"
        echo -e "   - Kore (女声，温柔)"
        echo ""
    fi
else
    echo -e "${RED}❌ 部署失败！${NC}"
    exit 1
fi

