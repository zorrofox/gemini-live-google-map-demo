# Server Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除冗余的 `app/server.py`，将前端 SPA 服务能力合并进 `service/server.py`，统一成一个服务端、一个 Dockerfile。

**Architecture:** `service/server.py` 新增 Jinja2 模板挂载和 `GET /` 路由，使其在处理眼镜/网页 WebSocket 的同时也能服务前端静态文件。`service/Dockerfile` 加入 Node.js 安装和 `npm run build` 步骤。`app/server.py` 及相关测试文件删除。

**Tech Stack:** Python 3.11, FastAPI, Jinja2, Starlette StaticFiles, Node.js 18 LTS, Vite, pytest

---

## 文件变更总览

| 操作 | 文件 |
|------|------|
| 修改 | `app-starter-pack/service/server.py` |
| 修改 | `app-starter-pack/service/Dockerfile` |
| 修改 | `app-starter-pack/tests/integration/test_server_e2e.py` |
| 修改 | `app-starter-pack/tests/unit/test_service_server.py` |
| 修改 | `app-starter-pack/CLAUDE.md` (若存在) 或根目录 `CLAUDE.md` |
| 删除 | `app-starter-pack/service/app/server.py` |
| 删除 | `app-starter-pack/tests/unit/test_server.py` |
| 删除 | `Dockerfile` (根目录) |
| 删除 | `deploy.sh` (根目录) |

---

### Task 1：为 `service/server.py` 补充前端 SPA 服务能力

**Files:**
- Modify: `app-starter-pack/service/server.py`
- Test: `app-starter-pack/tests/unit/test_service_server.py`

- [ ] **Step 1：写失败测试**

在 `tests/unit/test_service_server.py` 末尾追加：

```python
class TestSpaServing:
    def test_root_returns_html(self):
        """GET / 应返回前端 index.html。"""
        client = _svc_client()
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
```

- [ ] **Step 2：运行，确认失败**

```bash
cd app-starter-pack
python3 -m pytest tests/unit/test_service_server.py::TestSpaServing -v
```

期望：`FAILED` — `404 Not Found`（因为 `GET /` 路由还不存在）

- [ ] **Step 3：在 `service/server.py` 中添加 SPA 服务代码**

在文件顶部的 import 区块中添加（已有 FastAPI、WebSocket 等导入，只需补充缺失的）：

```python
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.requests import Request
```

在 `app = FastAPI(...)` 之后、`app.add_middleware(...)` 之前插入：

```python
# 服务前端 SPA（dist 由 npm run build 生成）
templates = Jinja2Templates(directory="./frontend/dist/")
app.mount('/assets', StaticFiles(directory="./frontend/dist/assets/", check_dir=False), 'assets')
```

在文件末尾所有路由之后、`if __name__ == "__main__"` 之前添加：

```python
@app.get("/")
async def serve_spa(request: Request) -> Any:
    """服务前端 React SPA（index.html）。"""
    return templates.TemplateResponse("index.html", {"request": request})
```

- [ ] **Step 4：运行测试，确认通过**

```bash
python3 -m pytest tests/unit/test_service_server.py::TestSpaServing -v
```

期望：`PASSED`

- [ ] **Step 5：运行全部单元测试，确认无回归**

```bash
python3 -m pytest tests/unit/ -v
```

期望：所有测试通过（73 个 + 新增 1 个 = 74 个）

- [ ] **Step 6：Commit**

```bash
cd app-starter-pack
git add service/server.py tests/unit/test_service_server.py
git commit -m "feat: add frontend SPA serving to service/server.py"
```

---

### Task 2：更新 `service/Dockerfile` 加入前端构建

**Files:**
- Modify: `app-starter-pack/service/Dockerfile`

- [ ] **Step 1：用以下内容替换 `service/Dockerfile` 全部内容**

```dockerfile
# Dockerfile for Service deployment to Cloud Run

FROM python:3.11-slim

# 安装 Node.js LTS
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /code

# 安装 Python 依赖
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

- [ ] **Step 2：验证 Dockerfile 语法**

```bash
cd app-starter-pack/service
docker build --no-cache --build-arg GOOGLE_API_KEY=test-key -t server-test . 2>&1 | tail -20
```

期望：`Successfully built ...`（或 `writing image ...` 类似成功提示）

> 如果没有 Docker 环境，跳过此步，在 CI 中验证。

- [ ] **Step 3：Commit**

```bash
git add service/Dockerfile
git commit -m "feat: add frontend build step to service/Dockerfile"
```

---

### Task 3：更新集成测试启动命令

**Files:**
- Modify: `app-starter-pack/tests/integration/test_server_e2e.py`

- [ ] **Step 1：修改 `start_server()` 中的 uvicorn 启动命令**

找到 `_build_server_command` 函数，将：

```python
def _build_server_command(port: int = 8000) -> list[str]:
    return [
        "poetry", "run", "uvicorn",
        "app.server:app",
        "--host", "0.0.0.0",
        "--port", str(port),
    ]
```

改为：

```python
def _build_server_command(port: int = 8000) -> list[str]:
    return [
        "poetry", "run", "uvicorn",
        "server:app",
        "--host", "0.0.0.0",
        "--port", str(port),
    ]
```

- [ ] **Step 2：运行集成测试，确认服务器能正常启动**

```bash
cd app-starter-pack
GOOGLE_API_KEY=AIzaSyDE-uYA3OvvIR0SxdOVyAwzT6ykWAtFinA \
FIRESTORE_PROJECT=grhuang-02 \
PROJECT_NUMBER=706422770546 \
ALLOWED_ORIGINS=http://localhost:5173 \
python3 -m pytest tests/integration/TestHealthEndpoint -v
```

期望：`2 passed`

- [ ] **Step 3：运行全套集成测试**

```bash
GOOGLE_API_KEY=AIzaSyDE-uYA3OvvIR0SxdOVyAwzT6ykWAtFinA \
FIRESTORE_PROJECT=grhuang-02 \
PROJECT_NUMBER=706422770546 \
ALLOWED_ORIGINS=http://localhost:5173 \
python3 -m pytest tests/integration/ -v
```

期望：`24 passed`

- [ ] **Step 4：Commit**

```bash
git add tests/integration/test_server_e2e.py
git commit -m "test: update integration test to use server:app entrypoint"
```

---

### Task 4：删除 `app/server.py` 及其单元测试

**Files:**
- Delete: `app-starter-pack/service/app/server.py`
- Delete: `app-starter-pack/tests/unit/test_server.py`

- [ ] **Step 1：删除文件**

```bash
cd app-starter-pack
rm service/app/server.py
rm tests/unit/test_server.py
```

- [ ] **Step 2：确认没有其他文件引用 `app.server`**

```bash
grep -r "app\.server\|from app import server\|app/server" \
  --include="*.py" --include="*.ts" --include="*.md" \
  app-starter-pack/ | grep -v "__pycache__"
```

期望：无输出（或只有注释、文档中的历史引用）

- [ ] **Step 3：运行单元测试，确认无回归**

```bash
python3 -m pytest tests/unit/ -v
```

期望：全部通过（删除 `test_server.py` 后测试数量减少，但剩余全部 pass）

- [ ] **Step 4：Commit**

```bash
git add -u service/app/server.py tests/unit/test_server.py
git commit -m "chore: remove deprecated app/server.py and its unit tests"
```

---

### Task 5：删除根目录的 Dockerfile 和 deploy.sh

**Files:**
- Delete: `Dockerfile`（根目录）
- Delete: `deploy.sh`（根目录）

- [ ] **Step 1：删除文件**

```bash
cd /home/greg_greghuang_altostrat_com/googlemap-demo
rm Dockerfile deploy.sh
```

- [ ] **Step 2：确认根目录无残留构建配置引用**

```bash
grep -r "deploy\.sh\|root.*Dockerfile" \
  --include="*.md" --include="*.yaml" --include="*.sh" . \
  | grep -v ".git"
```

期望：无关键引用（文档中的历史说明不影响功能）

- [ ] **Step 3：Commit**

```bash
git add -u Dockerfile deploy.sh
git commit -m "chore: remove root Dockerfile and deploy.sh (superseded by service/Dockerfile)"
```

---

### Task 6：更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`（根目录）

- [ ] **Step 1：更新开发命令部分**

将 CLAUDE.md 中的开发命令章节替换为以下内容（找到 `## Development Commands` 章节）：

```markdown
## Development Commands

All commands below assume you're in `app-starter-pack/service/`.

### Backend (Python/FastAPI)

```bash
# Install dependencies
poetry install

# Run backend (requires env vars, frontend must be built first)
GOOGLE_API_KEY=$GOOGLE_API_KEY \
PROJECT_NUMBER=$PROJECT_NUMBER \
FIRESTORE_PROJECT=$FIRESTORE_PROJECT \
poetry run uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# Run tests
poetry run pytest ../tests/unit
poetry run pytest ../tests/integration

# Lint
poetry run flake8
poetry run pylint app/ server.py
poetry run mypy app/ server.py
```

### Frontend (React/Vite/TypeScript)

```bash
# Install dependencies
npm --prefix frontend install

# Dev server (standalone, connects to backend separately)
npm --prefix frontend run dev

# Build (required before running backend to serve SPA)
echo VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_API_KEY > ./frontend/.env
npm --prefix frontend run build

# Lint / format
npm --prefix frontend run lint
npm --prefix frontend run format
```

### Running Both Together

```bash
cd app-starter-pack/service

echo VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_API_KEY > ./frontend/.env
npm --prefix frontend run build && \
  GOOGLE_API_KEY=$GOOGLE_API_KEY \
  PROJECT_NUMBER=$PROJECT_NUMBER \
  FIRESTORE_PROJECT=$FIRESTORE_PROJECT \
  poetry run uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```
```

- [ ] **Step 2：更新 Architecture 章节，移除对 `app/server.py` 的引用**

将 Architecture 章节中：

```
- **`server.py`** — FastAPI app. Serves the frontend SPA, exposes `/ws` WebSocket endpoint...
```

更新说明：两个服务端文件合并，现在只有 `server.py` 服务所有请求（SPA + WebSocket + HTTP 端点）。

- [ ] **Step 3：Commit**

```bash
cd /home/greg_greghuang_altostrat_com/googlemap-demo
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect consolidated server architecture"
```

---

### Task 7：全量验证

- [ ] **Step 1：单元测试全跑**

```bash
cd app-starter-pack
python3 -m pytest tests/unit/ -v --cov=service --cov-report=term-missing
```

期望：全部通过，`service/server.py` 覆盖率 ≥ 90%

- [ ] **Step 2：集成测试全跑**

```bash
fuser -k 8000/tcp 8001/tcp 2>/dev/null; sleep 2
GOOGLE_API_KEY=AIzaSyDE-uYA3OvvIR0SxdOVyAwzT6ykWAtFinA \
FIRESTORE_PROJECT=grhuang-02 \
PROJECT_NUMBER=706422770546 \
ALLOWED_ORIGINS=http://localhost:5173 \
python3 -m pytest tests/integration/ -v
```

期望：`24 passed`

- [ ] **Step 3：前端测试**

```bash
npm --prefix service/frontend run test:coverage
```

期望：`31 passed`

- [ ] **Step 4：确认无悬空引用**

```bash
grep -r "app\.server\|app/server" \
  --include="*.py" --include="*.ts" --include="*.md" \
  --include="*.yaml" --include="*.sh" \
  . | grep -v ".git" | grep -v "__pycache__"
```

期望：无功能性引用（注释/文档中的历史说明忽略）
