/**
 * QQ Channel HTTP API Client
 */

import {
  TokenResponse,
  GatewayResponse,
  SendMessageRequest,
  SendMessageResponse,
  DMSResponse,
} from '../types.js';

// Token endpoint is the same for both sandbox and production
const TOKEN_ENDPOINT = 'https://bots.qq.com/app/getAppAccessToken';

const PRODUCTION_API_BASE = 'https://api.sgroup.qq.com';
const SANDBOX_API_BASE = 'https://sandbox.api.sgroup.qq.com';

export interface QQClientConfig {
  appId: string;
  appSecret: string;
  sandbox?: boolean;
}

export class QQApiClient {
  private appId: string;
  private appSecret: string;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: QQClientConfig) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.baseUrl = config.sandbox ? SANDBOX_API_BASE : PRODUCTION_API_BASE;
  }

  /**
   * Get a valid access token, refreshing if necessary
   * QQ bots use a proprietary token endpoint, not standard OAuth 2.0
   * @param forceRefresh - Force refresh the token even if not expired
   */
  async getAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    // Refresh token 60 seconds before expiry (as recommended by QQ docs)
    if (!forceRefresh && this.accessToken && this.tokenExpiresAt > now + 60 * 1000) {
      return this.accessToken;
    }

    console.log('[QQ-Channel] Fetching new access token...');

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appId: String(this.appId),
        clientSecret: this.appSecret,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get access token: ${response.status} ${text}`);
    }

    const data = (await response.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = now + data.expires_in * 1000;

    console.log(`[QQ-Channel] Access token obtained, expires in ${data.expires_in}s`);

    return this.accessToken;
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `QQBot ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API request failed: ${response.status} ${text}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Get WebSocket gateway URL
   */
  async getGateway(): Promise<GatewayResponse> {
    return this.request<GatewayResponse>('GET', '/gateway/bot');
  }

  /**
   * Send a message to a channel
   */
  async sendChannelMessage(
    channelId: string,
    message: SendMessageRequest
  ): Promise<SendMessageResponse> {
    return this.request<SendMessageResponse>(
      'POST',
      `/channels/${channelId}/messages`,
      message
    );
  }

  /**
   * Create a DMS (Direct Message Session)
   */
  async createDMS(
    recipientId: string,
    sourceGuildId: string
  ): Promise<DMSResponse> {
    return this.request<DMSResponse>('POST', '/users/@me/dms', {
      recipient_id: recipientId,
      source_guild_id: sourceGuildId,
    });
  }

  /**
   * Send a direct message
   */
  async sendDirectMessage(
    guildId: string,
    message: SendMessageRequest
  ): Promise<SendMessageResponse> {
    return this.request<SendMessageResponse>(
      'POST',
      `/dms/${guildId}/messages`,
      message
    );
  }

  /**
   * Get the base URL being used
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}
