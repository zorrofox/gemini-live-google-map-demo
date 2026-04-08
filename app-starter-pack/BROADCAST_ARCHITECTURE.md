# 广播架构实现方案

## 🎯 最终方案（简化版）

### 核心思路
1. **一个Service** - 统一的WebSocket服务
2. **两种客户端** - 眼镜端（输入）+ Web端（展示）
3. **广播机制** - 所有Gemini响应同时发送给所有客户端

---

## 🔌 连接方式

### 眼镜端（音频输入源）
```
wss://your-service.run.app/ws?client_type=glasses&voice_name=Charon
```
- **作用**：发送音频给Service
- **接收**：所有Gemini响应
- **处理**：只播放音频部分

### Web端（观察者）
```
wss://your-service.run.app/ws?client_type=web
```
- **作用**：只接收，不发送
- **接收**：所有Gemini响应
- **处理**：展示地图、餐厅信息等

---

## 📊 简化架构图

```
眼镜端 ───发送音频───┐
                    │
                    ▼
                Service
              (广播中心)
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
    眼镜端                    Web端
   (播放音频)              (展示地图)
```

---

## 💡 关键实现

### 1. Connection Manager（连接管理器）
```python
class ConnectionManager:
    def __init__(self):
        self.glasses_ws = None          # 唯一的眼镜连接
        self.web_clients = []           # 多个Web连接
    
    async def broadcast_to_all(self, message):
        # 同时发送给所有客户端
        await self.glasses_ws.send_bytes(message)
        for web_ws in self.web_clients:
            await web_ws.send_bytes(message)
```

### 2. 客户端区分
```python
@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    client_type: str = "glasses"  # "glasses" 或 "web"
):
    if client_type == "glasses":
        # 注册为音频输入源
        connection_manager.connect_glasses(websocket)
        # 启动Gemini会话
        
    elif client_type == "web":
        # 注册为观察者
        connection_manager.connect_web(websocket)
        # 只接收，不启动Gemini会话
```

### 3. 广播机制
```python
async def receive_from_gemini(self):
    while result := await self.session._ws.recv(decode=False):
        # 广播给所有客户端
        await self.connection_manager.broadcast_to_all(result)
```

---

## ✅ 实现特点

1. **简单** - 不需要session_id，不需要复杂的会话管理
2. **清晰** - 通过client_type明确区分客户端角色
3. **高效** - 一次处理，多端同步
4. **灵活** - 可以轻松添加更多Web客户端

---

## 🚀 部署和使用

### 1. 部署Service
```bash
cd /Users/wangpd/Documents/googlemap-demo/app-starter-pack
./deploy-service.sh
```

### 2. 眼镜端连接
```javascript
const ws = new WebSocket('wss://your-service.run.app/ws?client_type=glasses');
ws.send(audioData);  // 发送音频
ws.onmessage = (e) => playAudio(e.data);  // 播放音频
```

### 3. Web端连接
```javascript
const ws = new WebSocket('wss://your-service.run.app/ws?client_type=web');
ws.onmessage = (e) => {
    displayMap(e.data);  // 展示地图和餐厅
};
// 不发送任何数据
```

---

## 📝 总结

**问题**：如何区分眼镜和Web端？  
**答案**：通过WebSocket连接参数 `client_type=glasses` 或 `client_type=web`

**问题**：眼镜端要做什么？  
**答案**：收音、发送、接收、播放

**问题**：Web端要做什么？  
**答案**：只接收、展示

**问题**：Service要做什么？  
**答案**：处理所有业务逻辑 + 广播给所有客户端

---

**就是这么简单！** 🎉

