#!/usr/bin/env python3
"""
Quick test script to verify Cloud Run WebSocket connection
Tests that serverContent messages are received correctly
"""
import asyncio
import websockets
import json
import sys

async def test_websocket():
    uri = "wss://restaurant-guide-service-224077212497.us-central1.run.app/ws?client_type=glasses&voice_name=Charon"
    
    print(f"🔌 连接到: {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ WebSocket 连接成功")
            
            # 1. 发送 setup 消息
            setup_msg = {
                "setup": {
                    "run_id": "test_run_123",
                    "user_id": "test_user_001"
                }
            }
            await websocket.send(json.dumps(setup_msg))
            print(f"📤 发送 setup 消息: {setup_msg}")
            
            # 2. 等待 setupComplete
            msg = await websocket.recv()
            if isinstance(msg, bytes):
                msg = msg.decode('utf-8')
            data = json.loads(msg)
            print(f"📥 收到: {list(data.keys())[0]}")
            
            # 3. 发送测试消息
            test_msg = {
                "clientContent": {
                    "turns": [{
                        "role": "user",
                        "parts": [{"text": "帮我推荐曼谷的泰国餐厅"}]
                    }],
                    "turnComplete": True
                }
            }
            await websocket.send(json.dumps(test_msg))
            print(f"📤 发送测试消息: 帮我推荐曼谷的泰国餐厅")
            
            # 4. 接收消息，统计 serverContent
            server_content_count = 0
            total_messages = 0
            
            print("\n⏳ 等待 AI 回复（最多30秒）...\n")
            
            try:
                async for message in websocket:
                    total_messages += 1
                    
                    # Blob/bytes 消息
                    if isinstance(message, bytes):
                        text = message.decode('utf-8')
                    else:
                        text = message
                    
                    try:
                        data = json.loads(text)
                        msg_type = list(data.keys())[0]
                        
                        if msg_type == 'serverContent':
                            server_content_count += 1
                            content = data['serverContent']
                            
                            # 检查是否有文本回复
                            if 'modelTurn' in content and 'parts' in content.get('modelTurn', {}):
                                for part in content['modelTurn']['parts']:
                                    if 'text' in part:
                                        print(f"💬 AI 文本: {part['text'][:100]}")
                            
                            # 检查是否有 grounding 数据
                            if 'groundingMetadata' in content and content['groundingMetadata']:
                                print(f"🗺️  收到 Grounding 数据（餐厅/地图信息）")
                            
                            # 检查是否完成
                            if content.get('turnComplete'):
                                print(f"\n✅ AI 回复完成！")
                                break
                    
                    except json.JSONDecodeError:
                        print(f"⚠️  无法解析 JSON")
                    
                    # 安全退出
                    if total_messages > 200:
                        print("\n⚠️  消息数量过多，停止接收")
                        break
            
            except asyncio.TimeoutError:
                print("\n⏱️  超时")
            
            print(f"\n📊 统计结果:")
            print(f"   - 总消息数: {total_messages}")
            print(f"   - serverContent 消息: {server_content_count}")
            
            if server_content_count > 0:
                print(f"\n🎉 测试成功！WebSocket 正常工作，可以发给眼镜团队！")
                return True
            else:
                print(f"\n❌ 测试失败：没有收到 serverContent 消息")
                return False
                
    except Exception as e:
        print(f"❌ 连接失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_websocket())
    sys.exit(0 if success else 1)

