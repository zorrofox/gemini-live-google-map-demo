# Dockerfile for Service deployment to Cloud Run
# Build context: app-starter-pack/
# Usage: docker build -f service/Dockerfile -t <image> .

FROM python:3.11-slim

# 安装 Node.js LTS
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /code

# 安装 Python 依赖（路径相对于 app-starter-pack/）
RUN pip install --no-cache-dir poetry==1.6.1
RUN poetry config virtualenvs.create false

COPY service/pyproject.toml service/README.md service/poetry.lock* ./
COPY service/app/ ./app/
COPY service/server.py ./

RUN poetry install --no-interaction --no-ansi --no-dev

# 构建前端（frontend/ 在 app-starter-pack/ 下，无需跟随符号链接）
COPY frontend/ ./frontend/
ARG GOOGLE_API_KEY
RUN echo "VITE_GOOGLE_MAPS_API_KEY=${GOOGLE_API_KEY}" > ./frontend/.env
RUN npm --prefix frontend install
RUN npm --prefix frontend run build

EXPOSE 8080
ENV PORT=8080
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
