# Server Consolidation Design

**Date:** 2026-04-08  
**Goal:** 删除冗余的 `app/server.py`，将所有功能统一到 `service/server.py`，保持一套代码和一个 Dockerfile。

---

## 背景

项目当前存在两个服务端文件，职责重叠且部署配置分裂：

| 文件 | 职责 | 问题 |
|------|------|------|
| `service/app/server.py` | 单客户端 WebSocket + 服务前端 SPA | 不支持眼镜+网页同时接入，前端已实际弃用 |
| `service/server.py` | 眼镜+网页双客户端广播 + 业务逻辑 | 缺少前端 SPA 服务能力 |

前端 `use-query-state.ts` 默认指向 `service/server.py` 部署的地址，说明实际生产使用的是后者，但它不能独立服务前端页面。

---

## 目标状态

只保留 `service/server.py`，使其成为唯一的服务端，同时具备：
1. 眼镜 + 网页双客户端 WebSocket 接入
2. 前端 SPA 静态文件服务
3. 所有 HTTP 端点（health、feedback、submititinerary、api/routes）

---

## 变更清单

### 删除
- `Dockerfile`（根目录）
- `deploy.sh`（根目录）
- `app-starter-pack/service/app/server.py`
- `tests/unit/test_server.py`（测试已删除的 `app/server.py`）

### 修改

#### 1. `service/server.py` — 补充前端 SPA 服务

新增依赖导入：
```python
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.requests import Request
```

新增挂载和路由：
```python
templates = Jinja2Templates(directory="./frontend/dist/")
app.mount('/assets', StaticFiles(directory="./frontend/dist/assets/"), 'assets')

@app.get("/")
async def serve_spa(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})
```

注意：静态文件挂载须在所有路由注册之后执行，避免路径冲突。

#### 2. `service/Dockerfile` — 加入前端构建

```dockerfile
FROM python:3.11-slim

# 安装 Node.js
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /code

RUN pip install --no-cache-dir poetry==1.6.1
RUN poetry config virtualenvs.create false

COPY pyproject.toml README.md poetry.lock* ./
COPY app/ ./app/
COPY server.py ./

RUN poetry install --no-interaction --no-ansi --no-dev

# 构建前端
COPY frontend/ ./frontend/
ARG GOOGLE_API_KEY
RUN echo "VITE_GOOGLE_MAPS_API_KEY=${GOOGLE_API_KEY}" > ./frontend/.env
RUN npm --prefix frontend install
RUN npm --prefix frontend run build

EXPOSE 8080
ENV PORT=8080
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
```

#### 3. `tests/unit/test_service_server.py` — 补充 SPA 路由测试

新增：
```python
def test_root_serves_spa(self):
    client = _svc_client()
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
```

#### 4. `tests/integration/test_server_e2e.py` — 更新启动命令

```python
# 改为
command = ["poetry", "run", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", str(port)]

# 不再是
command = ["poetry", "run", "uvicorn", "app.server:app", ...]
```

#### 5. `CLAUDE.md` — 更新开发命令

移除对 `app/server.py` 的引用，统一说明以 `service/server.py` 为准。

---

## 不变的内容

- `service/app/` 目录下的业务逻辑（`agent.py`、`tools.py`、`templates.py`、`vector_store.py`）完全不动
- `service/cloudbuild.yaml` 保持不变
- `app-starter-pack/outro/` 独立 Next.js 应用不受影响
- `tests/unit/test_service_server.py`、`test_tools.py`、`test_agent.py` 保持不变
- 前端代码完全不变

---

## 开发运行命令（整合后）

所有命令在 `app-starter-pack/service/` 目录下执行：

```bash
# 安装依赖
poetry install
npm --prefix frontend install

# 构建前端
echo VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_API_KEY > ./frontend/.env
npm --prefix frontend run build

# 启动服务（服务前端 + WebSocket）
GOOGLE_API_KEY=$GOOGLE_API_KEY \
FIRESTORE_PROJECT=$FIRESTORE_PROJECT \
PROJECT_NUMBER=$PROJECT_NUMBER \
poetry run uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# 单元测试
poetry run pytest ../tests/unit/

# 集成测试
GOOGLE_API_KEY=... FIRESTORE_PROJECT=... PROJECT_NUMBER=... \
poetry run pytest ../tests/integration/
```

---

## 风险与注意事项

1. **静态文件路径** — `StaticFiles` 挂载时 `./frontend/dist/assets/` 是相对于进程工作目录的路径，集成测试中已通过 symlink 解决，生产 Docker 镜像中目录结构正确，无风险。
2. **测试中的静态文件** — 单元测试 `conftest.py` 已有 `_NoCheckStaticFiles` 补丁，挂载时不检查目录是否存在，不受影响。
3. **`app/server.py` 中的 `/firestore` 端点** — 该端点为调试用途，`service/server.py` 中没有对应实现。不迁移（YAGNI），如需要可后续单独添加。
