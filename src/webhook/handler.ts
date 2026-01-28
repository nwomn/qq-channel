/**
 * Webhook Event Handler
 *
 * Converts webhook events to the same format as WebSocket events
 * and dispatches them to the onMessage callback.
 */

import type {
  MessagePayload,
  WebhookOpCode,
  EventType,
} from '../types.js';

export interface WebhookHandlerConfig {
  onMessage: (message: MessagePayload, isDirect: boolean) => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

export class WebhookHandler {
  private config: WebhookHandlerConfig;

  constructor(config: WebhookHandlerConfig) {
    this.config = config;
  }

  /**
   * Handle a webhook event
   * @param eventType The event type (e.g., AT_MESSAGE_CREATE)
   * @param eventContent The event content/payload
   */
  handleEvent(eventType: string, eventContent: unknown): void {
    console.log(`[QQ-Channel Webhook] Handling event: ${eventType}`);

    switch (eventType) {
      case 'AT_MESSAGE_CREATE':
        this.handleAtMessage(eventContent as MessagePayload);
        break;

      case 'DIRECT_MESSAGE_CREATE':
        this.handleDirectMessage(eventContent as MessagePayload);
        break;

      case 'MESSAGE_CREATE':
        // Public guild messages (requires special permission)
        this.handleAtMessage(eventContent as MessagePayload);
        break;

      default:
        console.log(`[QQ-Channel Webhook] Ignoring event type: ${eventType}`);
    }
  }

  /**
   * Handle AT_MESSAGE_CREATE event (channel message with @mention)
   */
  private handleAtMessage(message: MessagePayload): void {
    console.log('[QQ-Channel Webhook] Received AT message:', {
      id: message.id,
      content: message.content,
      author: message.author?.username,
      channelId: message.channel_id,
      guildId: message.guild_id,
    });

    this.config.onMessage(message, false);
  }

  /**
   * Handle DIRECT_MESSAGE_CREATE event (private message)
   */
  private handleDirectMessage(message: MessagePayload): void {
    console.log('[QQ-Channel Webhook] Received DM:', {
      id: message.id,
      content: message.content,
      author: message.author?.username,
      guildId: message.guild_id,
    });

    this.config.onMessage(message, true);
  }
}
