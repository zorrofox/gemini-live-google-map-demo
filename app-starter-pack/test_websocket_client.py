#!/usr/bin/env python3
"""
WebSocket 测试脚本 - 模拟眼镜端连接
测试 Service 的 WebSocket 连接和消息返回
"""

import asyncio
import json
import websockets
import base64
from datetime import datetime


def print_message(msg_type, content, color_code="0"):
    """彩色打印消息"""
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    colors = {
        "success": "92",  # 绿色
        "info": "94",     # 蓝色
        "warning": "93",  # 黄色
        "error": "91",    # 红色
        "data": "96",     # 青色
    }
    color = colors.get(color_code, "0")
    print(f"\033[{color}m[{timestamp}] {msg_type}\033[0m")
    if content:
        print(f"  {content}\n")


async def test_websocket():
    # WebSocket URL - 模拟眼镜端连接
    # 本地测试: ws://localhost:8080/ws
    # Cloud Run测试: wss://restaurant-guide-service-224077212497.us-central1.run.app/ws
    url = "wss://restaurant-guide-service-224077212497.us-central1.run.app/ws?client_type=glasses&voice_name=Charon"
    
    message_count = 0  # 初始化计数器
    
    print("\n" + "="*60)
    print_message("🔌 开始连接 WebSocket", url, "info")
    print("="*60 + "\n")
    
    try:
        async with websockets.connect(url) as websocket:
            print_message("✅ WebSocket 连接成功！", "等待接收消息...", "success")
            
            # 发送setup消息
            setup_msg = {
                "setup": {
                    "model": "models/gemini-2.0-flash-exp"
                },
                "client_content": {
                    "turns": [],
                    "turn_complete": True
                }
            }
            await websocket.send(json.dumps(setup_msg))
            print_message("📤 发送 Setup 消息", json.dumps(setup_msg, indent=2, ensure_ascii=False), "info")
            
            # 接收消息循环
            while True:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=60.0)
                    message_count += 1
                    
                    # 尝试解析JSON
                    try:
                        data = json.loads(message)
                        msg_type = list(data.keys())[0] if data else "unknown"
                        
                        print("\n" + "-"*60)
                        print_message(f"📨 消息 #{message_count} - 类型: {msg_type}", "", "data")
                        
                        # 根据消息类型打印
                        if msg_type == "setupComplete":
                            print_message("✅ Setup 完成", 
                                         f"Session ID: {data[msg_type].get('sessionId', 'N/A')}", 
                                         "success")
                        
                        elif msg_type == "serverContent":
                            print_message("🎯 收到 serverContent（这是关键！）", "", "success")
                            content = data[msg_type]
                            
                            # 检查是否有文本
                            if "modelTurn" in content:
                                parts = content["modelTurn"].get("parts", [])
                                for part in parts:
                                    if "text" in part:
                                        print_message("💬 文本内容", part["text"], "data")
                                    if "inlineData" in part:
                                        print_message("🔊 音频数据", 
                                                     f"大小: {len(part['inlineData'].get('data', ''))} bytes", 
                                                     "data")
                                    if "executableCode" in part:
                                        print_message("🔧 工具调用", 
                                                     json.dumps(part["executableCode"], indent=2, ensure_ascii=False), 
                                                     "warning")
                            
                            # 检查是否有 grounding response
                            if "groundingMetadata" in content:
                                print_message("🗺️  Grounding 信息（地图/餐厅）", 
                                             json.dumps(content["groundingMetadata"], indent=2, ensure_ascii=False)[:500] + "...", 
                                             "data")
                            
                            # 打印完整JSON（截断）
                            json_str = json.dumps(data, indent=2, ensure_ascii=False)
                            if len(json_str) > 2000:
                                json_str = json_str[:2000] + "\n  ... (截断，总长度: {} 字符)".format(len(json_str))
                            print(f"\033[90m完整 JSON:\n{json_str}\033[0m")
                        
                        elif msg_type == "toolCall":
                            print_message("🔧 工具调用", 
                                         json.dumps(data[msg_type], indent=2, ensure_ascii=False), 
                                         "warning")
                        
                        elif msg_type == "toolCallCancellation":
                            print_message("❌ 工具调用取消", 
                                         json.dumps(data[msg_type], indent=2, ensure_ascii=False), 
                                         "warning")
                        
                        else:
                            # 其他消息类型
                            json_str = json.dumps(data, indent=2, ensure_ascii=False)
                            if len(json_str) > 1000:
                                json_str = json_str[:1000] + "\n  ... (截断)"
                            print(f"\033[90m{json_str}\033[0m")
                        
                        print("-"*60)
                    
                    except json.JSONDecodeError:
                        print_message("⚠️  非 JSON 消息", f"长度: {len(message)} bytes", "warning")
                
                except asyncio.TimeoutError:
                    print_message("⏱️  60秒内没有新消息", "连接仍然活跃，继续等待...", "info")
                    continue
                
                except websockets.exceptions.ConnectionClosed:
                    print_message("🔌 连接已关闭", "", "warning")
                    break
    
    except Exception as e:
        print_message("❌ 错误", str(e), "error")
        import traceback
        traceback.print_exc()
    
    print("\n" + "="*60)
    print_message("🏁 测试结束", f"共收到 {message_count} 条消息", "info")
    print("="*60 + "\n")


if __name__ == "__main__":
    print("""
╔═══════════════════════════════════════════════════════════╗
║          WebSocket 测试脚本 - 眼镜端模拟                    ║
║                                                           ║
║  测试目标: ws://localhost:8080/ws                          ║
║  客户端类型: glasses                                        ║
║  语音: Charon                                              ║
║                                                           ║
║  关键消息类型:                                              ║
║    ✅ setupComplete  - 连接建立成功                         ║
║    🎯 serverContent  - Gemini返回内容（重点！）              ║
║    🔧 toolCall       - 工具调用（餐厅查询等）                ║
║                                                           ║
║  按 Ctrl+C 退出测试                                         ║
╚═══════════════════════════════════════════════════════════╝
    """)
    
    try:
        asyncio.run(test_websocket())
    except KeyboardInterrupt:
        print("\n\n测试被用户中断")

