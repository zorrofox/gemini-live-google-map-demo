/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Content, GenerativeContentBlob, Part} from '@google/generative-ai';
import {EventEmitter} from 'eventemitter3';
import {
  ClientContentMessage,
  isInterrupted,
  isModelTurn,
  isServerContenteMessage,
  isSetupCompleteMessage,
  isToolCallCancellationMessage,
  isToolCallMessage,
  isTurnComplete,
  LiveIncomingMessage,
  ModelTurn,
  RealtimeInputMessage,
  ServerContent,
  StreamingLog,
  ToolCall,
  ToolCallCancellation,
  ToolResponseMessage,
  type LiveConfig
} from '../multimodal-live-types';
import {blobToJSON, base64ToArrayBuffer} from './utils';

/**
 * the events that this client will emit
 */
interface MultimodalLiveClientEventTypes {
  open: () => void;
  log: (log: StreamingLog) => void;
  close: (event: CloseEvent) => void;
  audio: (data: ArrayBuffer) => void;
  content: (data: ServerContent) => void;
  interrupted: () => void;
  setupcomplete: () => void;
  status: (status: string) => void;
  turncomplete: () => void;
  toolcall: (toolCall: ToolCall) => void;
  toolcallcancellation: (toolcallCancellation: ToolCallCancellation) => void;
  /** 音频转录文字（native audio 模型的 outputTranscription） */
  transcription: (text: string) => void;
}

export type MultimodalLiveAPIClientConnection = {
  url?: string;
  runId?: string;
  userId?: string;
  voice?: string;
  textOnly?: boolean;
  clientType?: string; // 'glasses' 或 'web'
};

/**
 * A event-emitting class that manages the connection to the websocket and emits
 * events to the rest of the application.
 * If you dont want to use react you can still use this.
 */
export class MultimodalLiveClient extends EventEmitter<MultimodalLiveClientEventTypes> {
  public ws: WebSocket | null = null;
  protected config: LiveConfig | null = null;
  public url: URL | string = '';
  private runId: string;
  private userId?: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000; // 2 seconds
  private isManualDisconnect: boolean = false;
  private reconnectTimeoutId?: number;

  constructor({
    url,
    userId,
    runId,
    voice,
    textOnly,
    clientType
  }: MultimodalLiveAPIClientConnection) {
    super();
    // 修改为新的Service端口（8080）
    url = url || `ws://localhost:8080/ws`;

    // 确保URL包含 /ws 路径
    if (!url.endsWith('/ws') && !url.endsWith('/ws/')) {
      url = url.endsWith('/') ? url + 'ws' : url + '/ws';
    }

    this.url = new URL(url);

    // 客户端类型标识（默认为 'web' 观察者模式）
    // 可以通过URL参数改为 'glasses' 用于测试
    this.url.searchParams.append('client_type', clientType || 'web');

    if (voice) {
      this.url.searchParams.append('voice_name', voice);
    }

    if (textOnly) {
      this.url.searchParams.append('text_only', 'true');
    }

    this.url = this.url.href;

    this.userId = userId;
    this.runId = runId || crypto.randomUUID(); // Ensure runId is always a string by providing default
    this.send = this.send.bind(this);
  }

  log(type: string, message: StreamingLog['message']) {
    const log: StreamingLog = {
      date: new Date(),
      type,
      message
    };
    this.emit('log', log);
  }

  connect(newRunId?: string): Promise<boolean> {
    // 重置手动断开标志，允许自动重连
    this.isManualDisconnect = false;

    const ws = new WebSocket(this.url);

    // Update runId if provided
    if (newRunId) {
      this.runId = newRunId;
    }

    ws.addEventListener('message', async (evt: MessageEvent) => {
      if (evt.data instanceof Blob) {
        console.log('📦 Received Blob message:', evt.data.size, 'bytes');
        this.receive(evt.data);
      } else if (typeof evt.data === 'string') {
        console.log('📨 Received String message:', evt.data.substring(0, 200));
        try {
          const jsonData = JSON.parse(evt.data);
          console.log('✅ Parsed JSON:', Object.keys(jsonData));

          if (jsonData.status) {
            this.log('server.status', jsonData.status);
            console.log('ℹ️  Status:', jsonData.status);
          }
          if (jsonData.groundingResponse) {
            console.log('🗺️  groundingResponse detected! name:', jsonData.name);
            console.log(
              '🗺️  groundingResponse data:',
              jsonData.groundingResponse
            );
            this.emit('content', jsonData);
          }
        } catch (error) {
          console.error('❌ Error parsing message:', error);
        }
      } else {
        console.log('⚠️  Unhandled message type:', evt);
      }
    });

    return new Promise((resolve, reject) => {
      const onError = (ev: Event) => {
        this.disconnect(ws);
        const message = `Could not connect to "${this.url}"`;
        this.log(`server.${ev.type}`, message);
        reject(new Error(message));
      };
      ws.addEventListener('error', onError);
      ws.addEventListener('open', (ev: Event) => {
        this.log(`client.${ev.type}`, `connected to socket`);
        this.emit('open');

        this.ws = ws;
        // Send initial setup message with runId
        const setupMessage = {
          setup: {
            run_id: this.runId,
            user_id: this.userId
          }
        };
        this._sendDirect(setupMessage);
        ws.removeEventListener('error', onError);
        ws.addEventListener('close', (ev: CloseEvent) => {
          console.log('🔌 WebSocket closed:', ev);
          this.disconnect(ws);
          let reason = ev.reason || '';
          if (reason.toLowerCase().includes('error')) {
            const prelude = 'ERROR]';
            const preludeIndex = reason.indexOf(prelude);
            if (preludeIndex > 0) {
              reason = reason.slice(
                preludeIndex + prelude.length + 1,
                Infinity
              );
            }
          }
          this.log(
            `server.${ev.type}`,
            `disconnected ${reason ? `with reason: ${reason}` : ``}`
          );

          // 🔄 自动重连逻辑
          if (
            !this.isManualDisconnect &&
            this.reconnectAttempts < this.maxReconnectAttempts
          ) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts; // 递增延迟
            console.log(
              `🔄 Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`
            );
            this.log(
              'client.reconnecting',
              `Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
            );

            this.reconnectTimeoutId = setTimeout(() => {
              console.log('🔄 Reconnecting now...');
              this.connect()
                .then(() => {
                  console.log('✅ Reconnected successfully!');
                  this.reconnectAttempts = 0; // 重连成功后重置计数
                  this.log('client.reconnected', 'Reconnected successfully');
                })
                .catch(err => {
                  console.error('❌ Reconnection failed:', err);
                });
            }, delay);
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('❌ Max reconnect attempts reached');
            this.log(
              'client.reconnect_failed',
              'Max reconnect attempts reached'
            );
          }

          this.emit('close', ev);
        });

        // 连接成功后重置重连计数
        this.reconnectAttempts = 0;
        resolve(true);
      });
    });
  }

  disconnect(ws?: WebSocket, manual: boolean = false) {
    // 如果是手动断开，标记并清除重连计划
    if (manual) {
      this.isManualDisconnect = true;
      if (this.reconnectTimeoutId) {
        clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = undefined;
      }
      this.reconnectAttempts = 0;
      console.log('👤 Manual disconnect - auto-reconnect disabled');
    }

    // could be that this is an old websocket and there's already a new instance
    // only close it if its still the correct reference
    if ((!ws || this.ws === ws) && this.ws) {
      this.ws.close();
      this.ws = null;
      this.log('client.close', `Disconnected`);
      return true;
    }
    return false;
  }
  protected async receive(blob: Blob) {
    const response = (await blobToJSON(blob)) as LiveIncomingMessage;
    // console.log('Parsed response:', response);

    if (isToolCallMessage(response)) {
      this.log('server.toolCall', response);
      this.emit('toolcall', response.toolCall);
      return;
    }
    if (isToolCallCancellationMessage(response)) {
      this.log('receive.toolCallCancellation', response);
      this.emit('toolcallcancellation', response.toolCallCancellation);
      return;
    }

    if (isSetupCompleteMessage(response)) {
      this.log('server.send', 'setupComplete');
      this.emit('setupcomplete');
      return;
    }

    // this json also might be `contentUpdate { interrupted: true }`
    // or contentUpdate { end_of_turn: true }
    if (isServerContenteMessage(response)) {
      const {serverContent} = response;
      if (isInterrupted(serverContent)) {
        this.log('receive.serverContent', 'interrupted');
        this.emit('interrupted');
        return;
      }
      if (isTurnComplete(serverContent)) {
        this.log('server.send', 'turnComplete');
        this.emit('turncomplete');
        //plausible there's more to the message, continue
      }

      // native audio 模型的输出转录（outputTranscription）
      if (
        'outputTranscription' in serverContent &&
        serverContent.outputTranscription?.text
      ) {
        this.emit('transcription', serverContent.outputTranscription.text);
        this.log(
          'server.transcription',
          serverContent.outputTranscription.text
        );
      }

      if (isModelTurn(serverContent)) {
        let parts: Part[] = serverContent.modelTurn.parts;

        // when its audio that is returned for modelTurn
        const audioParts = parts.filter(
          p => p.inlineData && p.inlineData.mimeType.startsWith('audio/pcm')
        );
        const base64s = audioParts.map(p => p.inlineData?.data);

        // strip the audio parts out of the modelTurn
        const otherParts = [parts, audioParts].reduce((a, b) =>
          a.filter(c => !b.includes(c))
        );

        base64s.forEach(b64 => {
          if (b64) {
            const data = base64ToArrayBuffer(b64);
            this.emit('audio', data);
            this.log(`server.audio`, `buffer (${data.byteLength})`);
          }
        });
        if (!otherParts.length) {
          return;
        }

        parts = otherParts;

        const content: ModelTurn = {modelTurn: {parts}};
        this.emit('content', content);
        this.log(`server.content`, response);
      }
    } else {
      console.log('received unmatched message', response);
      this.log('received unmatched message', response);
    }
  }

  /**
   * send realtimeInput, this is base64 chunks of "audio/pcm" and/or "image/jpg"
   */
  sendRealtimeInput(chunks: GenerativeContentBlob[]) {
    let hasAudio = false;
    let hasVideo = false;
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      if (ch.mimeType.includes('audio')) {
        hasAudio = true;
      }
      if (ch.mimeType.includes('image')) {
        hasVideo = true;
      }
      if (hasAudio && hasVideo) {
        break;
      }
    }
    const message =
      hasAudio && hasVideo
        ? 'audio + video'
        : hasAudio
          ? 'audio'
          : hasVideo
            ? 'video'
            : 'unknown';

    const data: RealtimeInputMessage = {
      realtimeInput: {
        mediaChunks: chunks
      }
    };
    this._sendDirect(data);
    this.log(`client.realtimeInput`, message);
  }

  /**
   *  send a response to a function call and provide the id of the functions you are responding to
   */
  sendToolResponse(toolResponse: ToolResponseMessage['toolResponse']) {
    const message: ToolResponseMessage = {
      toolResponse
    };

    this._sendDirect(message);
    this.log(`client.toolResponse`, message);
  }

  /**
   * send normal content parts such as { text }
   */
  send(parts: Part | Part[], turnComplete: boolean = true) {
    parts = Array.isArray(parts) ? parts : [parts];
    const content: Content = {
      role: 'user',
      parts
    };

    const clientContentRequest: ClientContentMessage = {
      clientContent: {
        turns: [content],
        turnComplete
      }
    };

    this._sendDirect(clientContentRequest);
    this.log(`client.send`, clientContentRequest);
  }

  /**
   *  used internally to send all messages
   *  don't use directly unless trying to send an unsupported message type
   */
  _sendDirect(request: object) {
    if (!this.ws) {
      throw new Error('WebSocket is not connected');
    }
    const str = JSON.stringify(request);
    this.ws.send(str);
  }
}
