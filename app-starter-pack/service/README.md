# Restaurant Guide Service

## 📋 概述

这是一个WebSocket服务，支持智能眼镜和Web前端同时连接，提供完整的业务逻辑处理和广播机制。

### 核心功能

✅ **完整的业务逻辑**：
- Gemini API通信
- 工具函数执行（地图API、天气API等）
- 数据处理和响应生成

✅ **WebSocket接口 + 广播机制**：
- **眼镜端**：音频输入源（`client_type=glasses`）
- **Web端**：观察者模式（`client_type=web`）
- **广播**：所有Gemini响应同时发送给所有连接的客户端

✅ **服务端处理**：
- 所有工具调用在服务端执行
- 眼镜端只需要处理音频输入/输出
- Web端只需要接收并展示信息
- 完全封装的业务逻辑

---

## 🏗️ 架构说明

```
┌──────────────┐      ┌──────────────┐
│ 智能眼镜      │      │  Web前端     │
│ (glasses)    │      │  (web)      │
│ - 音频采集    │      │ - 3D地图     │
│ - 音频播放    │      │ - 餐厅信息   │
└──────┬───────┘      └──────┬───────┘
       │ 发送音频            │ 只接收
       │ 接收广播            │ 接收广播
       │ WS                 │ WS
       │                    │
┌──────┴────────────────────┴──────┐
│          Service                 │
│      (Connection Manager)        │
│                                  │
│  ┌────────────────────────────┐ │
│  │  Gemini API               │ │
│  └─────────┬──────────────────┘ │
│            │                    │
│  ┌─────────▼──────────────────┐ │
│  │  Tools                     │ │
│  │  - Maps API               │ │
│  │  - Weather API            │ │
│  │  - Firestore              │ │
│  └───────────────────────────┘ │
│                                │
│  完整业务逻辑 + 广播机制         │
└──────────────────────────────────┘
```

---

## 🚀 本地开发

### 1. 启动服务

```bash
cd /Users/wangpd/Documents/googlemap-demo/app-starter-pack

# 添加执行权限
chmod +x start-service.sh

# 启动服务
./start-service.sh
```

**期望输出：**
```
✓ 启动Service服务 (端口 8080)...
INFO:     Uvicorn running on http://0.0.0.0:8080
```

### 2. 测试健康检查

```bash
curl http://localhost:8080/health
```

**期望返回：**
```json
{
  "status": "healthy",
  "service": "restaurant_guide",
  "mode": "full_business_logic"
}
```

---

## 📡 WebSocket API

### 连接端点

```
ws://localhost:8080/ws
```

### 查询参数

| 参数 | 类型 | 默认值 | 必需 | 说明 |
|------|------|--------|------|------|
| `client_type` | string | "glasses" | ✅ | 客户端类型："glasses"（音频输入）或"web"（观察者） |
| `voice_name` | string | "Charon" | ❌ | AI语音名称 |
| `text_only` | string | "false" | ❌ | 是否只使用文本 |

### 客户端类型说明

#### 1. 眼镜端（glasses）
- **作用**：音频输入源
- **行为**：发送音频，接收所有Gemini响应
- **连接**：`ws://localhost:8080/ws?client_type=glasses`

#### 2. Web端（web）
- **作用**：观察者
- **行为**：只接收，不发送音频
- **连接**：`ws://localhost:8080/ws?client_type=web`

### 可用的语音

- **Aoede** - 女声，优雅
- **Charon** - 男声，沉稳（默认）
- **Fenrir** - 男声，有力
- **Puck** - 男声，活泼
- **Kore** - 女声，温柔

### 连接示例

#### 眼镜端连接

```javascript
// JavaScript/TypeScript - 眼镜端
const ws = new WebSocket('ws://localhost:8080/ws?client_type=glasses&voice_name=Charon');

ws.onopen = () => {
  console.log('Glasses connected to service');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.serverContent) {
    // 处理Gemini响应，提取音频播放
    const parts = data.serverContent.modelTurn.parts;
    parts.forEach(part => {
      if (part.inlineData) {
        playAudio(part.inlineData.data); // 播放音频
      }
    });
  }
};

// 发送音频数据
ws.send(JSON.stringify({
  "realtimeInput": {
    "mediaChunks": [{
      "mimeType": "audio/pcm;rate=16000",
      "data": audioData.toString('hex')
    }]
  }
}));
```

#### Web端连接

```javascript
// JavaScript/TypeScript - Web端
const ws = new WebSocket('ws://localhost:8080/ws?client_type=web');

ws.onopen = () => {
  console.log('Web client connected to service');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.serverContent) {
    // 展示文本响应
    displayText(data.serverContent.modelTurn.parts);
  }
  
  if (data.groundingResponse) {
    // 展示地图和餐厅信息
    displayRestaurantsOnMap(data.groundingResponse);
  }
};

// Web端不发送音频，只接收
```

---

## 📨 消息格式

### 输入（眼镜 → Service）

#### 1. 音频输入
```json
{
  "realtimeInput": {
    "mediaChunks": [{
      "mimeType": "audio/pcm;rate=16000",
      "data": "hex_encoded_audio_data"
    }]
  }
}
```

#### 2. 文本输入
```json
{
  "clientContent": {
    "turns": [{
      "role": "user",
      "parts": [{"text": "推荐曼谷的餐厅"}]
    }],
    "turnComplete": true
  }
}
```

### 输出（Service → 眼镜）

#### 1. 状态消息
```json
{
  "status": "Service is ready for conversation"
}
```

#### 2. Gemini响应（完整内容）
```json
{
  "serverContent": {
    "modelTurn": {
      "role": "model",
      "parts": [
        {"text": "这是AI的回复..."},
        {"inlineData": {"mimeType": "audio/pcm", "data": "..."}}
      ]
    },
    "turnComplete": true
  }
}
```

#### 3. 地图数据（用于显示）
```json
{
  "groundingResponse": {
    "model_text": "推荐的餐厅信息...",
    "grounding_metadata": {
      "supportChunks": [{
        "sourceMetadata": {
          "title": "Restaurant Name",
          "document_id": "place_id_123",
          "text": "餐厅描述"
        }
      }]
    }
  },
  "name": "get_restaurant_suggestions_result"
}
```

---

## 🔧 工具功能

Service自动执行以下工具（眼镜端无需处理）：

### 餐厅相关
- `get_restaurant_suggestions` - 获取餐厅建议
- `select_restaurant` - 选择餐厅
- `get_place_information` - 获取餐厅详细信息
- `show_place_photos` - 获取餐厅照片
- `hide_photos` - 隐藏照片

### 其他工具
- `get_weather` - 获取天气信息
- `submit_itinerary` - 提交行程

**重要：** 所有工具调用都在Service端执行，眼镜端只需要接收最终结果！

---

## 🌐 部署到 Cloud Run

### 1. 准备部署

```bash
# 设置项目ID
export PROJECT_ID="juyun-juyunlifang"

# 添加执行权限
chmod +x deploy-service.sh
```

### 2. 执行部署

```bash
./deploy-service.sh
```

### 3. 获取服务URL

部署成功后，你会看到：

```
🌐 Service URL:
   https://restaurant-guide-service-xxx.run.app

📱 WebSocket 连接地址（给眼镜端使用）：
   wss://restaurant-guide-service-xxx.run.app/ws
```

### 4. 测试Cloud Run部署

```bash
# 健康检查
curl https://restaurant-guide-service-xxx.run.app/health

# WebSocket连接（使用wscat）
npm install -g wscat
wscat -c "wss://restaurant-guide-service-xxx.run.app/ws?voice_name=Charon"
```

---

## 🔍 客户端集成指南

### 眼镜端集成（client_type=glasses）

#### 眼镜端需要做的：

1. **连接WebSocket（必须指定client_type=glasses）**
```
wss://your-service.run.app/ws?client_type=glasses&voice_name=Charon
```

2. **发送音频数据**
```javascript
// 采集音频
const audioData = captureAudioFromMic();

// 发送到Service
ws.send(JSON.stringify({
  "realtimeInput": {
    "mediaChunks": [{
      "mimeType": "audio/pcm;rate=16000",
      "data": audioData.toString('hex')
    }]
  }
}));
```

3. **接收并处理响应（主要播放音频）**
```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.serverContent) {
    // 处理Gemini的完整响应
    const parts = data.serverContent.modelTurn.parts;
    
    parts.forEach(part => {
      if (part.inlineData) {
        // 音频响应：直接播放 ← 核心功能
        playAudio(part.inlineData.data);
      }
      if (part.text) {
        // 文本响应：可选显示
        console.log('Text:', part.text);
      }
    });
  }
  
  if (data.groundingResponse) {
    // 地图数据：可选显示（如果眼镜有屏幕）
    displayRestaurants(data.groundingResponse);
  }
};
```

#### 眼镜端不需要做的：

❌ 调用地图API  
❌ 调用天气API  
❌ 执行任何工具函数  
❌ 处理业务逻辑  

**Service会处理所有这些！**

---

### Web端集成（client_type=web）

#### Web端需要做的：

1. **连接WebSocket（必须指定client_type=web）**
```javascript
const ws = new WebSocket('wss://your-service.run.app/ws?client_type=web');
```

2. **只接收，不发送音频**
```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.status) {
    // 状态消息
    console.log('Status:', data.status);
  }
  
  if (data.serverContent) {
    // Gemini文本响应
    displayText(data.serverContent.modelTurn.parts);
  }
  
  if (data.groundingResponse) {
    // 餐厅数据 - 在地图上显示
    updateMap(data.groundingResponse.grounding_metadata);
    displayRestaurantCards(data.groundingResponse.grounding_metadata.supportChunks);
  }
};

// Web端不发送音频！
```

3. **展示视觉信息**
- 3D Google Maps
- 餐厅卡片
- 照片画廊
- 天气信息

#### Web端不需要做的：

❌ 采集音频  
❌ 发送任何输入  
❌ 调用任何API  

**Web端是纯观察者模式！**

---

## 📊 数据流示意

```
1. 眼镜采集音频 (glasses端)
    ↓
2. 发送到Service (WebSocket)
    client_type=glasses
    ↓
3. Service → Gemini: "推荐餐厅"
    ↓
4. Gemini → Service: toolCall("get_restaurant_suggestions")
    ↓
5. Service执行: 调用Google Maps API ← Service内部处理
    ↓
6. Service → Gemini: 返回餐厅数据
    ↓
7. Gemini → Service: "这里有3家不错的餐厅..."
    (文本 + 音频 + 数据)
    ↓
8. Service广播给所有连接的客户端
    ├─→ 眼镜端 (glasses)
    │   └─→ 播放音频
    │
    └─→ Web端 (web)
        └─→ 显示地图 + 餐厅卡片
```

**关键点：**
- ✓ 只有眼镜端发送音频（唯一输入源）
- ✓ Web端只接收，不发送
- ✓ 所有Gemini响应同时广播给所有客户端
- ✓ 工具执行在Service端，客户端看不到中间过程

---

## 🐛 故障排除

### 问题1：WebSocket连接失败

```bash
# 检查服务是否运行
curl http://localhost:8080/health

# 查看服务日志
# 本地：查看终端输出
# Cloud Run：gcloud run services logs tail restaurant-guide-service --region us-central1
```

### 问题2：Gemini API认证失败

```bash
# 检查环境变量
echo $GOOGLE_API_KEY
echo $PROJECT_NUMBER

# 检查GCP认证
gcloud auth application-default login
```

### 问题3：工具调用失败

查看日志中的错误信息：
```
ERROR: Error processing tool call: ...
```

通常是因为：
- API密钥不正确
- 网络问题
- API配额不足

---

## 📝 API 端点列表

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/ws` | WebSocket | 主要通信端点 |
| `/feedback` | POST | 收集反馈 |
| `/submititinerary` | POST | 提交行程 |

---

## 🔗 相关文档

- [项目主README](../README.md)
- [Gemini Live API文档](https://ai.google.dev/gemini-api/docs/live-api)
- [Google Maps API文档](https://developers.google.com/maps)

---

## 💡 开发建议

1. **本地开发**：先在本地测试功能
2. **日志监控**：关注Service端的日志输出
3. **错误处理**：眼镜端要处理好网络断开重连
4. **音频格式**：确保音频格式与Gemini API兼容

---

## 📞 技术支持

如有问题，请检查：
1. Service日志
2. 网络连接
3. API配置
4. 环境变量设置

