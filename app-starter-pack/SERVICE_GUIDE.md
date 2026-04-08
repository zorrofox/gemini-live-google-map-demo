# Service改造完成指南

## ✅ 改造完成

根据需求，Service端改造已完成！

---

## 📋 改造内容总结

### ✅ 需求1：Web Service分开
- **Web前端**：连接到Service的WebSocket（`client_type=web`）
- **Service端**：`service/server.py` - 统一的WebSocket服务

### ✅ 需求2：Service包装为WebSocket + 广播机制
- **对外**：WebSocket接口 (`/ws`)
- **对内**：完整业务逻辑（Gemini + 工具执行）
- **广播**：Gemini响应同时发送给所有连接的客户端

### ✅ 需求3：输入眼镜音频，输出Gemini完整内容
- **输入源**：眼镜的音频流（唯一输入源）
- **输出**：Gemini的完整响应广播给所有客户端
  - **眼镜端**：接收所有内容，只播放音频部分
  - **Web端**：接收所有内容，展示地图、餐厅等信息
- **工具调用**：Service内部执行，客户端看不到中间过程

---

## 🗂️ 新增文件

```
app-starter-pack/
├── service/                      # 【新增】专门给眼镜用的Service
│   ├── server.py                # 核心服务代码
│   ├── Dockerfile               # Cloud Run部署用
│   └── README.md                # 详细文档
├── start-service.sh             # 【新增】本地启动脚本
├── deploy-service.sh            # 【新增】Cloud Run部署脚本
└── SERVICE_GUIDE.md             # 【新增】本文档
```

---

## 🚀 使用流程

### Phase 1: 本地测试

#### 1. 启动Service
```bash
cd /Users/wangpd/Documents/googlemap-demo/app-starter-pack

# 添加执行权限
chmod +x start-service.sh

# 启动服务
./start-service.sh
```

#### 2. 验证健康检查
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

#### 3. 测试WebSocket连接

**测试眼镜端连接（音频输入源）：**
```bash
# 使用wscat测试
npm install -g wscat
wscat -c "ws://localhost:8080/ws?client_type=glasses"
```

**测试Web端连接（观察者）：**
```bash
wscat -c "ws://localhost:8080/ws?client_type=web"
```

---

### Phase 2: 部署到Cloud Run

#### 1. 准备部署
```bash
# 确保环境变量正确
cat .env

# 设置项目ID
export PROJECT_ID="juyun-juyunlifang"

# 添加执行权限
chmod +x deploy-service.sh
```

#### 2. 执行部署
```bash
./deploy-service.sh
```

**部署过程：**
1. ✓ 检查认证
2. ✓ 启用API
3. ✓ 构建Docker镜像
4. ✓ 推送到GCR
5. ✓ 部署到Cloud Run
6. ✓ 获取服务URL

#### 3. 获取WebSocket地址
部署成功后，你会看到：
```
📱 WebSocket 连接地址（给眼镜端使用）：
   wss://restaurant-guide-service-xxx.run.app/ws
```

**把这个地址给眼镜端团队！**

---

## 📱 客户端集成

### 眼镜端集成（音频输入源）

#### 1. WebSocket连接地址
```
wss://restaurant-guide-service-xxx.run.app/ws?client_type=glasses
```

#### 2. 连接参数
```
client_type=glasses    # 必需：标识为眼镜端
voice_name=Charon      # 可选：AI语音
text_only=false        # 可选：是否纯文本模式
```

完整示例：
```
wss://restaurant-guide-service-xxx.run.app/ws?client_type=glasses&voice_name=Charon&text_only=false
```

可用语音：
- Aoede (女声，优雅)
- Charon (男声，沉稳) ← 默认
- Fenrir (男声，有力)
- Puck (男声，活泼)
- Kore (女声，温柔)

---

### Web端集成（观察者）

#### 1. WebSocket连接地址
```
wss://restaurant-guide-service-xxx.run.app/ws?client_type=web
```

#### 2. 特点
- **只接收，不发送**：Web端不发送音频，只接收Gemini响应
- **自动同步**：接收眼镜端触发的所有Gemini响应
- **用于展示**：地图、餐厅信息、图片等

#### 3. 音频格式
```
mimeType: "audio/pcm;rate=16000"
编码: hex
```

---

## 📊 完整架构图

```
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│       智能眼镜端                │    │         Web前端                 │
│     (client_type=glasses)       │    │      (client_type=web)          │
│                                 │    │                                 │
│  ┌──────────┐  ┌──────────┐   │    │  ┌──────────┐  ┌──────────┐   │
│  │ 音频采集  │  │ 音频播放  │   │    │  │ 3D地图   │  │ 餐厅信息  │   │
│  └────┬─────┘  └─────▲────┘   │    │  └─────▲────┘  └─────▲────┘   │
│       │              │          │    │        │             │         │
└───────┼──────────────┼──────────┘    └────────┼─────────────┼─────────┘
        │              │                         │             │
        │ 发送音频      │ 接收广播                 │             │ 接收广播
        │              │                         │             │
┌───────▼──────────────┴─────────────────────────┴─────────────┴─────────┐
│                    Service (Cloud Run)                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │              Connection Manager (连接管理器)                      │  │
│  │  - glasses_ws: WebSocket (唯一音频输入源)                        │  │
│  │  - web_clients: [WebSocket, ...] (多个观察者)                   │  │
│  └──────────────────────────┬──────────────────────────────────────┘  │
│                             │                                          │
│  ┌──────────────────────────▼──────────────────────────────────────┐  │
│  │                   WebSocket Handler                              │  │
│  │  - 接收来自眼镜的音频                                             │  │
│  │  - 广播Gemini响应给所有客户端                                     │  │
│  └──────────────────────────┬──────────────────────────────────────┘  │
│                             │                                          │
│  ┌──────────────────────────▼──────────────────────────────────────┐  │
│  │                      Gemini API                                  │  │
│  │   - 接收音频/文本                                                 │  │
│  │   - 生成响应                                                      │  │
│  │   - 触发工具调用                                                  │  │
│  └──────────────────────────┬──────────────────────────────────────┘  │
│                             │                                          │
│  ┌──────────────────────────▼──────────────────────────────────────┐  │
│  │                    Tool Execution                                │  │
│  │   - get_restaurant_suggestions                                   │  │
│  │   - get_place_information                                        │  │
│  │   - show_place_photos                                            │  │
│  │   - get_weather                                                  │  │
│  │                                                                  │  │
│  │   调用外部API：                                                   │  │
│  │   ├─ Google Maps API                                            │  │
│  │   ├─ Weather API                                                │  │
│  │   └─ Firestore                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ✓ 完整业务逻辑在Service端处理                                           │
│  ✓ 所有响应广播给眼镜和Web端                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 数据流示例

### 场景：用户通过眼镜说"推荐泰国餐厅"

```
1. 眼镜采集音频
   ↓
2. 眼镜通过WebSocket发送音频到Service
   WebSocket -> ws://service/ws?client_type=glasses
   {
     "realtimeInput": {
       "mediaChunks": [{"mimeType": "audio/pcm", "data": "..."}]
     }
   }
   ↓
3. Service接收并发给Gemini
   ↓
4. Gemini理解后请求工具调用
   toolCall: "get_restaurant_suggestions"
   args: {prompt: "Thai restaurant in Bangkok"}
   ↓
5. Service自己执行工具（调用Google Maps API）
   ↓
6. Service把结果返回给Gemini
   ↓
7. Gemini生成最终回复
   "这里有3家不错的泰国餐厅：
    1. Som Tam Nua - 著名的泰北菜
    2. Thip Samai - 最佳泰式炒河粉
    3. Bo.Lan - 高端泰国料理"
   ↓
8. Service广播完整响应给所有连接的客户端
   
   ┌─────────────────────────────────┐
   │  广播给眼镜端 (glasses_ws)       │
   │  {                              │
   │    "serverContent": {           │
   │      "modelTurn": {             │
   │        "parts": [               │
   │          {"text": "推荐内容..."} │
   │          {"inlineData": {       │
   │            "audio": "..."       │
   │          }}                     │
   │        ]                        │
   │      }                          │
   │    }                            │
   │  }                              │
   │  +                              │
   │  {                              │
   │    "groundingResponse": {       │
   │      "grounding_metadata": {    │
   │        "supportChunks": [...]   │
   │      }                          │
   │    }                            │
   │  }                              │
   └─────────────────────────────────┘
                │
                ├─────────────────────────────┐
                │                             │
   ┌────────────▼────────────┐   ┌────────────▼────────────┐
   │  眼镜端接收               │   │  Web端接收               │
   │  - 播放音频               │   │  - 显示3D地图            │
   │  - (可选)显示餐厅信息     │   │  - 显示餐厅卡片          │
   │                          │   │  - 显示评分/照片         │
   └──────────────────────────┘   └──────────────────────────┘
```

**关键点：**
1. ✓ 步骤5的工具执行完全在Service端，客户端看不到
2. ✓ 步骤8的响应同时广播给眼镜和Web端
3. ✓ 眼镜端主要处理音频，Web端主要处理视觉展示

---

## ⚙️ 环境变量配置

Service需要的环境变量（已在`.env`中）：

```bash
# Google API配置
GOOGLE_API_KEY=AIza...
PROJECT_NUMBER=224077212497
PROJECT_ID=juyun-juyunlifang

# Vertex AI配置
VERTEXAI=true
REGION=us-central1

# Firestore配置（可选）
# FIRESTORE_PROJECT=...
```

---

## 🧪 测试清单

### 本地测试
- [ ] Service启动成功（端口8080）
- [ ] 健康检查返回正常
- [ ] WebSocket可以连接
- [ ] 可以发送消息
- [ ] 收到Gemini响应

### Cloud Run测试
- [ ] 部署成功
- [ ] 获取到服务URL
- [ ] 健康检查返回正常
- [ ] WebSocket可以连接
- [ ] 完整对话流程正常

---

## 📞 提供给眼镜端团队的信息

### 文档
- **详细文档**：`service/README.md`
- **快速指南**：本文档

### 关键信息
```
WebSocket地址：wss://your-service.run.app/ws
默认语音：Charon
音频格式：audio/pcm;rate=16000
返回内容：Gemini完整响应（包含文本、音频、数据）
```

### 示例代码
参见 `service/README.md` 中的"眼镜端集成指南"部分

---

## 🎯 下一步

1. ✅ **本地测试Service**
   ```bash
   ./start-service.sh
   curl http://localhost:8080/health
   ```

2. ✅ **部署到Cloud Run**
   ```bash
   ./deploy-service.sh
   ```

3. ✅ **获取WebSocket地址**
   部署成功后记录URL

4. ✅ **提供给眼镜端团队**
   - WebSocket地址
   - API文档（service/README.md）
   - 音频格式要求
   - 示例代码

5. ✅ **联调测试**
   - 眼镜端连接测试
   - 完整对话流程测试
   - 各种场景测试

---

## 💡 重要提醒

### 对眼镜端团队说：
1. **连接时必须指定client_type=glasses** - 标识为音频输入源
2. **只需要处理音频输入输出** - 采集音频发送，接收音频播放
3. **不需要调用任何API** - Service会处理所有业务逻辑
4. **接收完整的Gemini响应** - 包含文本、音频、数据（可以选择性使用）
5. **工具调用是透明的** - 看不到中间过程

### 对Web前端团队说：
1. **连接时必须指定client_type=web** - 标识为观察者
2. **不发送音频，只接收** - 被动接收所有Gemini响应
3. **用于视觉展示** - 地图、餐厅卡片、图片等
4. **自动同步** - 眼镜端交互时，Web端自动更新

### Service端的优势：
- ✅ 统一的业务逻辑（一份代码，服务所有客户端）
- ✅ 广播机制（一次处理，多端同步）
- ✅ 更容易维护和更新
- ✅ 更好的安全性（API密钥在服务端）
- ✅ 客户端更轻量（眼镜只需音频I/O，Web只需展示）
- ✅ 更灵活的扩展性（可以轻松添加更多观察者）

---

**Service改造完成！现在可以部署和集成了！** 🚀

