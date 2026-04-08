#!/usr/bin/env python3
"""
WebSocket 调试脚本 — 模拟眼镜端 (glasses) 连接

用法：
  # 连接本地服务（默认）
  python test_websocket_client.py

  # 连接 Cloud Run
  python test_websocket_client.py --env cloud

  # 指定自定义 URL
  python test_websocket_client.py --url ws://localhost:8000/ws

  # 指定语音角色
  python test_websocket_client.py --voice Aoede
"""

import argparse
import asyncio
import json
from datetime import datetime

import websockets

LOCAL_URL = "ws://localhost:8000/ws"
CLOUD_URL = "wss://restaurant-guide-service-224077212497.us-central1.run.app/ws"


def print_message(msg_type: str, content: str, color_code: str = "0") -> None:
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    colors = {
        "success": "92",
        "info": "94",
        "warning": "93",
        "error": "91",
        "data": "96",
    }
    color = colors.get(color_code, "0")
    print(f"\033[{color}m[{timestamp}] {msg_type}\033[0m")
    if content:
        print(f"  {content}\n")


async def test_websocket(url: str) -> None:
    print("\n" + "=" * 60)
    print_message("🔌 开始连接 WebSocket", url, "info")
    print("=" * 60 + "\n")

    message_count = 0

    try:
        async with websockets.connect(url) as websocket:
            print_message("✅ WebSocket 连接成功！", "等待接收消息...", "success")

            # 发送 setup 消息（server.py 期望的格式）
            setup_msg = {
                "setup": {
                    "run_id": f"debug_{int(datetime.now().timestamp())}",
                    "user_id": "debug_user",
                }
            }
            await websocket.send(json.dumps(setup_msg))
            print_message(
                "📤 发送 Setup 消息",
                json.dumps(setup_msg, indent=2, ensure_ascii=False),
                "info",
            )

            # 消息接收循环
            while True:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=60.0)
                    message_count += 1

                    # 解析 JSON（服务端发送 bytes 或 str）
                    raw = message.decode("utf-8") if isinstance(message, bytes) else message
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        print_message(
                            "⚠️  非 JSON 消息",
                            f"长度: {len(raw)} bytes",
                            "warning",
                        )
                        continue

                    msg_type = list(data.keys())[0] if data else "unknown"

                    print("\n" + "-" * 60)
                    print_message(f"📨 消息 #{message_count} — 类型: {msg_type}", "", "data")

                    if msg_type == "setupComplete":
                        print_message("✅ Setup 完成", "", "success")

                    elif msg_type == "serverContent":
                        content = data[msg_type]
                        print_message("🎯 收到 serverContent", "", "success")

                        for part in content.get("modelTurn", {}).get("parts", []):
                            if "text" in part:
                                print_message("💬 文本", part["text"], "data")
                            if "inlineData" in part:
                                size = len(part["inlineData"].get("data", ""))
                                print_message("🔊 音频数据", f"大小: {size} bytes", "data")

                        transcription = content.get("outputTranscription", {}).get("text")
                        if transcription:
                            print_message("📝 转录", transcription, "data")

                        if content.get("groundingMetadata"):
                            meta_str = json.dumps(
                                content["groundingMetadata"],
                                indent=2,
                                ensure_ascii=False,
                            )[:500]
                            print_message("🗺️  Grounding 数据", meta_str + "...", "data")

                        # 打印完整 JSON（截断）
                        json_str = json.dumps(data, indent=2, ensure_ascii=False)
                        if len(json_str) > 2000:
                            json_str = json_str[:2000] + f"\n  ... (截断，总长度: {len(json_str)} 字符)"
                        print(f"\033[90m完整 JSON:\n{json_str}\033[0m")

                    elif msg_type == "toolCall":
                        print_message(
                            "🔧 工具调用",
                            json.dumps(data[msg_type], indent=2, ensure_ascii=False),
                            "warning",
                        )

                    elif msg_type == "toolCallCancellation":
                        print_message(
                            "❌ 工具调用取消",
                            json.dumps(data[msg_type], indent=2, ensure_ascii=False),
                            "warning",
                        )

                    else:
                        json_str = json.dumps(data, indent=2, ensure_ascii=False)
                        if len(json_str) > 1000:
                            json_str = json_str[:1000] + "\n  ... (截断)"
                        print(f"\033[90m{json_str}\033[0m")

                    print("-" * 60)

                except asyncio.TimeoutError:
                    print_message("⏱️  60 秒内没有新消息", "连接仍活跃，继续等待...", "info")

                except websockets.exceptions.ConnectionClosed:
                    print_message("🔌 连接已关闭", "", "warning")
                    break

    except Exception as exc:
        print_message("❌ 错误", str(exc), "error")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 60)
    print_message("🏁 测试结束", f"共收到 {message_count} 条消息", "info")
    print("=" * 60 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="WebSocket 调试脚本 — 模拟眼镜端连接")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--env", choices=["local", "cloud"], default="local", help="目标环境（默认: local）")
    group.add_argument("--url", help="自定义 WebSocket URL")
    parser.add_argument("--voice", default="Charon", help="语音角色（默认: Charon）")
    args = parser.parse_args()

    if args.url:
        base_url = args.url
    else:
        base_url = LOCAL_URL if args.env == "local" else CLOUD_URL

    url = f"{base_url}?client_type=glasses&voice_name={args.voice}"

    print(f"""
╔══════════════════════════════════════════════════════════╗
║          WebSocket 调试脚本 — 眼镜端模拟                   ║
║                                                          ║
║  目标: {url[:52].ljust(52)} ║
║  语音: {args.voice.ljust(52)} ║
║                                                          ║
║  关键消息类型:                                             ║
║    ✅ setupComplete  — 连接建立成功                        ║
║    🎯 serverContent  — Gemini 返回内容                    ║
║    🔧 toolCall       — 工具调用（餐厅查询等）              ║
║                                                          ║
║  按 Ctrl+C 退出                                            ║
╚══════════════════════════════════════════════════════════╝
    """)

    try:
        asyncio.run(test_websocket(url))
    except KeyboardInterrupt:
        print("\n\n测试被用户中断")


if __name__ == "__main__":
    main()
