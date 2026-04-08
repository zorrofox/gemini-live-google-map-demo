#!/usr/bin/env python3
"""
WebSocket 功能验证脚本 — 发送文本消息并验证 AI 回复

用法：
  # 连接本地服务（默认）
  python test_cloud_ws.py

  # 连接 Cloud Run
  python test_cloud_ws.py --env cloud

  # 自定义 URL 和查询内容
  python test_cloud_ws.py --url ws://localhost:8000/ws --query "推荐迪拜的黎巴嫩餐厅"

退出码：
  0 — 成功收到 serverContent
  1 — 连接或超时失败
"""

import argparse
import asyncio
import json
import sys

import websockets

LOCAL_URL = "ws://localhost:8000/ws"
CLOUD_URL = "wss://restaurant-guide-service-224077212497.us-central1.run.app/ws"

DEFAULT_QUERY = "帮我推荐迪拜购物中心附近适合家庭聚餐的餐厅"
VOICE = "Charon"
TIMEOUT_SECONDS = 30
MAX_MESSAGES = 200


async def test_websocket(url: str, query: str) -> bool:
    print(f"🔌 连接到: {url}")

    try:
        async with websockets.connect(url) as websocket:
            print("✅ WebSocket 连接成功")

            # 1. 发送 setup
            setup_msg = {
                "setup": {
                    "run_id": "verify_run_001",
                    "user_id": "verify_user",
                }
            }
            await websocket.send(json.dumps(setup_msg))
            print(f"📤 发送 setup: {setup_msg}")

            # 2. 等待 setupComplete
            raw = await websocket.recv()
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            data = json.loads(raw)
            print(f"📥 收到: {list(data.keys())[0]}")

            # 3. 发送测试查询
            test_msg = {
                "clientContent": {
                    "turns": [{"role": "user", "parts": [{"text": query}]}],
                    "turnComplete": True,
                }
            }
            await websocket.send(json.dumps(test_msg))
            print(f"📤 发送查询: {query}")

            # 4. 接收回复
            server_content_count = 0
            total_messages = 0
            print(f"\n⏳ 等待 AI 回复（最多 {TIMEOUT_SECONDS} 秒）...\n")

            try:
                async with asyncio.timeout(TIMEOUT_SECONDS):
                    async for message in websocket:
                        total_messages += 1

                        raw = message.decode("utf-8") if isinstance(message, bytes) else message
                        try:
                            data = json.loads(raw)
                        except json.JSONDecodeError:
                            print("⚠️  无法解析 JSON")
                            continue

                        msg_type = list(data.keys())[0]

                        if msg_type == "serverContent":
                            server_content_count += 1
                            content = data["serverContent"]

                            for part in content.get("modelTurn", {}).get("parts", []):
                                if "text" in part:
                                    print(f"💬 AI 文本: {part['text'][:100]}")

                            if content.get("outputTranscription", {}).get("text"):
                                print(f"📝 转录: {content['outputTranscription']['text'][:100]}")

                            if content.get("groundingMetadata"):
                                print("🗺️  收到 Grounding 数据（餐厅/地图）")

                            if content.get("turnComplete"):
                                print(f"\n✅ AI 回复完成！")
                                break

                        elif msg_type == "toolCall":
                            name = data["toolCall"].get("functionCalls", [{}])[0].get("name", "?")
                            print(f"🔧 工具调用: {name}")

                        if total_messages > MAX_MESSAGES:
                            print("\n⚠️  消息数量过多，停止接收")
                            break

            except TimeoutError:
                print(f"\n⏱️  {TIMEOUT_SECONDS} 秒内未收到完整回复")

            print(f"\n📊 统计结果:")
            print(f"   总消息数: {total_messages}")
            print(f"   serverContent: {server_content_count}")

            if server_content_count > 0:
                print("\n🎉 测试成功！WebSocket 工作正常。")
                return True
            else:
                print("\n❌ 测试失败：未收到 serverContent 消息")
                return False

    except Exception as exc:
        print(f"❌ 连接失败: {exc}")
        import traceback
        traceback.print_exc()
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="WebSocket 功能验证脚本")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--env", choices=["local", "cloud"], default="local", help="目标环境（默认: local）")
    group.add_argument("--url", help="自定义 WebSocket URL（不含查询参数）")
    parser.add_argument("--query", default=DEFAULT_QUERY, help="发送给 AI 的测试内容")
    args = parser.parse_args()

    if args.url:
        base_url = args.url
    else:
        base_url = LOCAL_URL if args.env == "local" else CLOUD_URL

    url = f"{base_url}?client_type=glasses&voice_name={VOICE}"

    success = asyncio.run(test_websocket(url, args.query))
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
