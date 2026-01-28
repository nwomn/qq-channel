/**
 * QQ Channel WebSocket Runtime
 */

import type { PluginRuntime } from './sdk-types.js';
import WebSocket from 'ws';
import {
  OpCode,
  WSPayload,
  HelloPayload,
  ReadyPayload,
  MessagePayload,
  EventType,
  Intents,
} from './types.js';
import { QQApiClient } from './api/client.js';

// Plugin runtime storage
let pluginRuntime: PluginRuntime | null = null;

export function setQQRuntime(runtime: PluginRuntime): void {
  pluginRuntime = runtime;
}

export function getQQRuntime(): PluginRuntime {
  if (!pluginRuntime) {
    throw new Error('QQ Channel runtime not initialized');
  }
  return pluginRuntime;
}

export interface RuntimeConfig {
  appId: string;
  botToken: string;
  apiClient: QQApiClient;
  onMessage: (message: MessagePayload, isDirect: boolean) => void;
  onReady: (sessionId: string, botUser: { id: string; username: string }) => void;
  onError: (error: Error) => void;
}

// Cache for access token used in WebSocket auth
let cachedAccessToken: string | null = null;

export class QQChannelRuntime {
  private config: RuntimeConfig;
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastSequence: number | null = null;
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;
  private isClosing = false;

  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  /**
   * Start the WebSocket connection
   */
  async start(): Promise<void> {
    try {
      // Get access token first (this will be used for WebSocket auth)
      cachedAccessToken = await this.config.apiClient.getAccessToken();

      // Get the gateway URL
      const gateway = await this.config.apiClient.getGateway();
      const wsUrl = gateway.url;

      console.log(`[QQ-Channel] Connecting to WebSocket: ${wsUrl}`);

      this.ws = new WebSocket(wsUrl);
      this.setupWebSocketHandlers();
    } catch (error) {
      console.error('[QQ-Channel] Failed to start runtime:', error);
      this.config.onError(error as Error);
      this.scheduleReconnect();
    }
  }

  /**
   * Stop the WebSocket connection
   */
  async stop(): Promise<void> {
    this.isClosing = true;
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.sessionId = null;
    this.lastSequence = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      console.log('[QQ-Channel] WebSocket connected');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const payload: WSPayload = JSON.parse(data.toString());
        this.handlePayload(payload);
      } catch (error) {
        console.error('[QQ-Channel] Failed to parse message:', error);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[QQ-Channel] WebSocket closed: ${code} ${reason}`);
      this.stopHeartbeat();

      if (!this.isClosing) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (error) => {
      console.error('[QQ-Channel] WebSocket error:', error);
      this.config.onError(error);
    });
  }

  /**
   * Handle incoming WebSocket payloads
   */
  private handlePayload(payload: WSPayload): void {
    // Update sequence number
    if (payload.s !== undefined && payload.s !== null) {
      this.lastSequence = payload.s;
    }

    switch (payload.op) {
      case OpCode.Hello:
        this.handleHello(payload.d as HelloPayload);
        break;

      case OpCode.Dispatch:
        this.handleDispatch(payload.t as EventType, payload.d);
        break;

      case OpCode.HeartbeatAck:
        // Heartbeat acknowledged
        break;

      case OpCode.Reconnect:
        console.log('[QQ-Channel] Server requested reconnect');
        this.reconnect();
        break;

      case OpCode.InvalidSession:
        console.log('[QQ-Channel] Invalid session, reconnecting...');
        this.sessionId = null;
        this.reconnect();
        break;

      default:
        console.warn(`[QQ-Channel] Unknown opcode: ${payload.op}`);
    }
  }

  /**
   * Handle Hello payload and send Identify
   */
  private handleHello(data: HelloPayload): void {
    console.log(`[QQ-Channel] Received Hello, heartbeat interval: ${data.heartbeat_interval}ms`);

    // Start heartbeat
    this.startHeartbeat(data.heartbeat_interval);

    // Send Identify
    this.sendIdentify();
  }

  /**
   * Send Identify payload
   */
  private sendIdentify(): void {
    // Use minimal intents for sandbox testing
    // PUBLIC_GUILD_MESSAGES requires special permission
    const intents =
      Intents.GUILDS |
      Intents.GUILD_MEMBERS |
      Intents.GUILD_MESSAGES |
      Intents.DIRECT_MESSAGE;

    // Use Access Token authentication (new method)
    // Old method "Bot {appId}.{botToken}" is deprecated
    const token = `QQBot ${cachedAccessToken}`;

    const identifyPayload: WSPayload = {
      op: OpCode.Identify,
      d: {
        token,
        intents,
        shard: [0, 1],
        properties: {
          $os: 'linux',
          $browser: 'clawdbot-qq-channel',
          $device: 'clawdbot-qq-channel',
        },
      },
    };

    console.log('[QQ-Channel] Sending Identify with:');
    console.log('[QQ-Channel]   Token type: QQBot (Access Token)');
    console.log('[QQ-Channel]   Access Token (first 10 chars):', cachedAccessToken?.substring(0, 10) + '...');
    console.log('[QQ-Channel]   Intents:', intents);

    this.send(identifyPayload);
    console.log('[QQ-Channel] Sent Identify');
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(interval: number): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      const heartbeatPayload: WSPayload = {
        op: OpCode.Heartbeat,
        d: this.lastSequence,
      };

      this.send(heartbeatPayload);
    }, interval);
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Handle dispatch events
   */
  private handleDispatch(eventType: EventType, data: unknown): void {
    switch (eventType) {
      case 'READY':
        this.handleReady(data as ReadyPayload);
        break;

      case 'AT_MESSAGE_CREATE':
        this.config.onMessage(data as MessagePayload, false);
        break;

      case 'DIRECT_MESSAGE_CREATE':
        this.config.onMessage(data as MessagePayload, true);
        break;

      case 'RESUMED':
        console.log('[QQ-Channel] Session resumed');
        break;

      default:
        // Ignore other events
        break;
    }
  }

  /**
   * Handle Ready event
   */
  private handleReady(data: ReadyPayload): void {
    this.sessionId = data.session_id;
    this.reconnectAttempts = 0;

    console.log(`[QQ-Channel] Ready! Session ID: ${this.sessionId}`);
    console.log(`[QQ-Channel] Bot user: ${data.user.username} (${data.user.id})`);

    this.config.onReady(this.sessionId, data.user);
  }

  /**
   * Send a payload to the WebSocket
   */
  private send(payload: WSPayload): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.isClosing) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[QQ-Channel] Max reconnect attempts reached');
      this.config.onError(new Error('Max reconnect attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(`[QQ-Channel] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  /**
   * Reconnect to WebSocket
   */
  private reconnect(): void {
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.start();
  }
}
