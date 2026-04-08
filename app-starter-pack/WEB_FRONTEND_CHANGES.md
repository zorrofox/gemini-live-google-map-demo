# Web前端改造说明

## ✅ 已完成的修改

### 1. WebSocket连接地址
- **旧地址**：`ws://localhost:8000/ws`
- **新地址**：`ws://localhost:8080/ws`（连接到新的Service）

### 2. 客户端类型标识
添加了 `client_type` 参数来区分客户端：
- **Web端（默认）**：`client_type=web` - 观察者模式，只接收不发送
- **眼镜端**：`client_type=glasses` - 音频输入源，发送音频

### 3. 灵活的测试模式
通过URL参数控制客户端类型，方便测试：

---

## 🚀 使用方式

### 方式1：Web端模式（观察者，默认）

```bash
# 启动Web前端
cd frontend
npm run dev

# 访问（默认为观察者模式）
http://localhost:5173
```

**特点：**
- ✅ 只接收Gemini响应
- ✅ 不发送音频（即使点击麦克风也不会发送）
- ✅ 展示地图、餐厅信息等
- ✅ 适合最终生产环境

---

### 方式2：测试模式（模拟眼镜端）

在眼镜端接入之前，如果需要测试Service端的完整功能，可以让Web端模拟眼镜端：

```bash
# 访问时添加 clientType=glasses 参数
http://localhost:5173?clientType=glasses
```

**特点：**
- ✅ 可以发送音频给Gemini
- ✅ 可以触发Gemini会话
- ✅ 用于测试Service端的音频处理功能
- ⚠️  仅用于测试，不用于生产环境

---

## 📝 修改的文件

### 1. `frontend/src/utils/multimodal-live-client.ts`
```typescript
// 修改前
url = url || `ws://localhost:8000/ws`;

// 修改后
url = url || `ws://localhost:8080/ws`;
this.url.searchParams.append('client_type', clientType || 'web');
```

### 2. `frontend/src/hooks/use-query-state.ts`
```typescript
// 新增：默认端口改为8080
const defaultHost = window.location.hostname === 'localhost'
  ? 'localhost:8080'  // 从8000改为8080
  : window.location.host;

// 新增：客户端类型参数
export const useClientTypeParam = () =>
  useQueryState('clientType', {defaultValue: 'web'});
```

### 3. `frontend/src/hooks/use-live-api.ts`
```typescript
// 新增：读取并使用clientType参数
const [clientType] = useClientTypeParam();
const client = useMemo(
  () => new MultimodalLiveClient({url, userId, voice, textOnly, clientType}),
  [url, userId, voice, textOnly, clientType]
);
```

---

## 🔄 数据流对比

### 最终生产环境（Web端 = 观察者）

```
眼镜端 ─发送音频→ Service ─广播→ ┬─→ 眼镜端（播放音频）
                               └─→ Web端（展示地图）
```

### 测试环境（Web端模拟眼镜端）

```
Web端 ─发送音频→ Service ─广播→ Web端（展示+播放）
```

---

## 🧪 测试步骤

### 步骤1：启动Service
```bash
cd /Users/wangpd/Documents/googlemap-demo/app-starter-pack
./start-service.sh
```

### 步骤2：启动Web前端
```bash
cd frontend
npm install  # 首次运行需要安装依赖
npm run dev
```

### 步骤3：测试观察者模式（默认）
```bash
# 访问
http://localhost:5173

# 现象：
# - Web前端连接成功
# - 但无法触发Gemini对话（因为是观察者）
# - 需要等待眼镜端发送音频
```

### 步骤4：测试眼镜端模拟模式
```bash
# 访问（添加clientType=glasses参数）
http://localhost:5173?clientType=glasses

# 现象：
# - Web前端连接成功
# - 可以点击麦克风发送音频
# - 可以触发Gemini对话
# - 可以看到餐厅建议、地图等
```

---

## 📱 等眼镜端接入后

当眼镜端接入后，Web端应该使用默认的观察者模式：

```bash
# Web端（观察者）
http://localhost:5173

# 眼镜端会连接
wss://your-service.run.app/ws?client_type=glasses
```

**工作流程：**
1. 眼镜端发送音频到Service
2. Service处理并调用Gemini
3. Gemini响应广播给眼镜端和Web端
4. 眼镜端播放音频
5. Web端展示地图、餐厅信息

---

## ⚙️ 配置说明

### URL参数列表

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `clientType` | string | "web" | 客户端类型："web"（观察者）或 "glasses"（音频输入） |
| `host` | string | "localhost:8080" | Service地址 |
| `protocol` | string | "ws" | 协议：ws或wss |
| `voice` | string | "Charon" | AI语音 |
| `textOnly` | boolean | false | 是否纯文本模式 |

### 示例URL

```bash
# 默认（Web观察者）
http://localhost:5173

# 模拟眼镜端测试
http://localhost:5173?clientType=glasses

# 自定义Service地址
http://localhost:5173?host=your-service.run.app&protocol=wss

# 完整配置
http://localhost:5173?clientType=web&host=localhost:8080&protocol=ws&voice=Charon
```

---

## 🎯 总结

### 当前状态
- ✅ Web前端已修改完成
- ✅ 默认为观察者模式（client_type=web）
- ✅ 支持测试模式（clientType=glasses）
- ✅ 连接到新的Service（端口8080）

### 下一步
1. **测试Service端**：使用Web端的测试模式验证Service功能
2. **等待眼镜端接入**：眼镜端使用 `client_type=glasses` 连接
3. **联调测试**：眼镜端发送音频，Web端展示信息

### 注意事项
- ⚠️  测试模式仅用于开发测试
- ⚠️  生产环境Web端应该使用默认的观察者模式
- ⚠️  眼镜端必须使用 `client_type=glasses`

---

**Web前端改造完成！可以开始测试了！** 🎉

