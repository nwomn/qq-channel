/**
 * QQ Channel Plugin for Clawdbot
 * Implements the ChannelPlugin interface
 */

import type { ChannelPlugin } from './sdk-types.js';
import { QQApiClient } from './api/client.js';
import { QQChannelRuntime, getQQRuntime } from './runtime.js';
import type { QQChannelAccount, MessagePayload } from './types.js';

// Store for active runtimes and API clients
const activeRuntimes: Map<string, QQChannelRuntime> = new Map();
const apiClients: Map<string, QQApiClient> = new Map();

// Store for preventing duplicate replies to the same message
const recentReplies: Map<string, { text: string; timestamp: number }> = new Map();
const REPLY_DEDUP_WINDOW_MS = 5000; // 5 seconds window for deduplication

const DEFAULT_ACCOUNT_ID = 'default';

/**
 * Resolve QQ channel account configuration
 */
function resolveQQAccount(cfg: any, accountId: string): QQChannelAccount | null {
  const qqConfig = cfg?.channels?.['qq-channel'];
  if (!qqConfig) return null;

  // Support both direct config and nested accounts
  if (qqConfig.accounts && qqConfig.accounts[accountId]) {
    return qqConfig.accounts[accountId];
  }

  // Direct config (when accountId is 'default')
  if (accountId === DEFAULT_ACCOUNT_ID && qqConfig.appId) {
    return {
      appId: String(qqConfig.appId),
      appSecret: String(qqConfig.appSecret),
      botToken: String(qqConfig.botToken),
      sandbox: Boolean(qqConfig.sandbox),
    };
  }

  return null;
}

/**
 * List all configured QQ accounts
 */
function listQQAccountIds(cfg: any): string[] {
  const qqConfig = cfg?.channels?.['qq-channel'];
  if (!qqConfig) return [];

  if (qqConfig.accounts) {
    return Object.keys(qqConfig.accounts);
  }

  if (qqConfig.appId) {
    return [DEFAULT_ACCOUNT_ID];
  }

  return [];
}

/**
 * Create or get an API client for an account
 */
function getOrCreateApiClient(accountId: string, config: QQChannelAccount): QQApiClient {
  let client = apiClients.get(accountId);
  if (!client) {
    client = new QQApiClient({
      appId: config.appId,
      appSecret: config.appSecret,
      sandbox: config.sandbox,
    });
    apiClients.set(accountId, client);
  }
  return client;
}

/**
 * The QQ Channel plugin implementation
 */
export const qqChannelPlugin: ChannelPlugin<QQChannelAccount> = {
  id: 'qq-channel',

  meta: {
    label: 'QQ Channel',
    docsPath: 'channels/qq-channel',
    blurb: 'Connect to QQ Channel (频道) using the official Tencent API',
  },

  capabilities: {
    chatTypes: ['channel', 'direct'],
    reactions: false,
    threads: false,
    media: true,
    nativeCommands: true,  // Enable slash commands support
    blockStreaming: false,
  },

  reload: {
    configPrefixes: ['channels.qq-channel'],
  },

  configSchema: {
    type: 'object',
    properties: {
      appId: {
        type: 'string',
        description: 'QQ Bot Application ID',
      },
      appSecret: {
        type: 'string',
        description: 'QQ Bot Application Secret',
      },
      botToken: {
        type: 'string',
        description: 'QQ Bot Token',
      },
      sandbox: {
        type: 'boolean',
        description: 'Use sandbox/test environment',
        default: false,
      },
      accounts: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            appId: { type: 'string' },
            appSecret: { type: 'string' },
            botToken: { type: 'string' },
            sandbox: { type: 'boolean', default: false },
          },
        },
      },
    },
  },

  config: {
    listAccountIds: (cfg) => listQQAccountIds(cfg),

    resolveAccount: (cfg, accountId) => resolveQQAccount(cfg, accountId),

    defaultAccountId: () => DEFAULT_ACCOUNT_ID,

    isConfigured: (account) => !!(account && account.appId && account.appSecret && account.botToken),

    describeAccount: (account) => ({
      name: `QQ Bot ${account.appId}`,
      fields: {
        appId: account.appId,
        sandbox: account.sandbox ? 'Yes' : 'No',
      },
    }),
  },

  outbound: {
    deliveryMode: 'direct',
    textChunkLimit: 4000,

    sendText: async ({ to, text, accountId, replyToId }) => {
      const runtime = getQQRuntime();
      const cfg = runtime.config.loadConfig();
      const account = resolveQQAccount(cfg, accountId);

      if (!account) {
        throw new Error(`Account ${accountId} not configured`);
      }

      const client = getOrCreateApiClient(accountId, account);

      const response = await client.sendChannelMessage(to, {
        content: text,
        msg_id: replyToId,
      });

      return {
        messageId: response.id,
        timestamp: new Date(response.timestamp),
      };
    },

    sendMedia: async ({ to, text, mediaUrl, accountId, replyToId }) => {
      const runtime = getQQRuntime();
      const cfg = runtime.config.loadConfig();
      const account = resolveQQAccount(cfg, accountId);

      if (!account) {
        throw new Error(`Account ${accountId} not configured`);
      }

      const client = getOrCreateApiClient(accountId, account);

      const response = await client.sendChannelMessage(to, {
        content: text,
        image: mediaUrl,
        msg_id: replyToId,
      });

      return {
        messageId: response.id,
        timestamp: new Date(response.timestamp),
      };
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },

    buildChannelSummary: () => ({
      health: 'ok',
    }),

    buildAccountSnapshot: ({ account, runtime }) => ({
      account: {
        id: runtime?.accountId || DEFAULT_ACCOUNT_ID,
        name: `QQ Bot ${account.appId}`,
        configured: !!(account.appId && account.appSecret && account.botToken),
      },
      runtime: runtime || {
        accountId: DEFAULT_ACCOUNT_ID,
        running: false,
        lastStartAt: null,
        lastStopAt: null,
        lastError: null,
      },
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      // Log ctx structure for debugging
      console.log('[QQ-Channel] Gateway context keys:', Object.keys(ctx));
      const clawdbotRuntime = (ctx as any).runtime;
      console.log('[QQ-Channel] Runtime keys:', Object.keys(clawdbotRuntime || {}));
      if (clawdbotRuntime?.gateway) {
        console.log('[QQ-Channel] Runtime.gateway keys:', Object.keys(clawdbotRuntime.gateway));
      }

      const { accountId, cfg } = ctx;

      // Check if already running
      if (activeRuntimes.has(accountId)) {
        console.log(`[QQ-Channel] Account ${accountId} already running`);
        return null;
      }

      const account = resolveQQAccount(cfg, accountId);
      if (!account) {
        throw new Error(`Account ${accountId} not configured`);
      }

      const client = getOrCreateApiClient(accountId, account);

      const runtime = new QQChannelRuntime({
        appId: account.appId,
        botToken: account.botToken,
        apiClient: client,

        onMessage: async (message: MessagePayload, isDirect: boolean) => {
          const core = getQQRuntime();
          const cfg = core.config.loadConfig();

          // Log message for debugging
          console.log('[QQ-Channel] Received message:', {
            id: message.id,
            content: message.content,
            author: message.author.username,
            channelId: message.channel_id,
            guildId: message.guild_id,
            isDirect,
          });

          const messageText = message.content?.trim() || '';
          if (!messageText) {
            console.log('[QQ-Channel] Empty message, skipping');
            return;
          }

          // Resolve agent route
          const route = core.channel.routing.resolveAgentRoute({
            cfg,
            channel: 'qq-channel',
            accountId,
            peer: {
              kind: isDirect ? 'dm' : 'channel',
              id: isDirect ? message.author.id : message.channel_id,
            },
          });

          const senderName = message.author.username || message.author.id;
          const fromLabel = isDirect ? senderName : `${senderName} in ${message.guild_id || message.channel_id}`;
          const timestamp = message.timestamp ? new Date(message.timestamp).getTime() : Date.now();

          // Check if this is a control command
          const isCommand = core.channel.text.hasControlCommand(messageText, cfg);

          // Format the message body
          const body = core.channel.reply.formatAgentEnvelope({
            channel: 'QQ Channel',
            from: fromLabel,
            timestamp,
            body: messageText,
          });

          // Create inbound context
          const ctxPayload = core.channel.reply.finalizeInboundContext({
            Body: body,
            RawBody: messageText,
            CommandBody: messageText,
            From: isDirect ? `qq-channel:dm:${message.author.id}` : `qq-channel:channel:${message.channel_id}`,
            To: `qq-channel:${message.channel_id}`,
            SessionKey: route.sessionKey,
            AccountId: route.accountId,
            ChatType: isDirect ? 'direct' : 'channel',
            ConversationLabel: fromLabel,
            SenderName: senderName,
            SenderId: message.author.id,
            SenderUsername: message.author.username,
            GroupSubject: isDirect ? undefined : (message.guild_id || message.channel_id),
            GroupChannel: isDirect ? undefined : message.channel_id,
            Provider: 'qq-channel',
            Surface: 'qq-channel',
            MessageSid: message.id,
            CommandAuthorized: isCommand ? true : undefined,  // Enable command execution
            OriginatingChannel: 'qq-channel',
            OriginatingTo: `qq-channel:${message.channel_id}`,
          });

          console.log('[QQ-Channel] Dispatching to AI with session:', route.sessionKey);

          // Get response prefix and human delay config
          const responsePrefix = core.channel.reply.resolveEffectiveMessagesConfig(cfg, route.agentId).responsePrefix;
          const humanDelay = core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId);

          // Dispatch to AI and deliver reply
          try {
            await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
              ctx: ctxPayload,
              cfg,
              dispatcherOptions: {
                responsePrefix,
                humanDelay,
                deliver: async (payload) => {
                  let replyText = payload.text;
                  if (!replyText) return;

                  // Filter sensitive URLs that QQ API rejects
                  // Replace domain names with shortened versions to avoid content policy issues
                  replyText = replyText
                    .replace(/clawdhub\.com/g, 'clawdhub')
                    .replace(/https?:\/\/[^\s)]+/g, '[link]');  // Replace URLs with [link] placeholder

                  // QQ API has a message length limit (approximately 4000 characters)
                  // Truncate if necessary to avoid API rejection
                  const MAX_MESSAGE_LENGTH = 2000; // Try smaller limit to be safe
                  if (replyText.length > MAX_MESSAGE_LENGTH) {
                    const truncateMsg = '\n\n...(消息过长，已截断)';
                    replyText = replyText.slice(0, MAX_MESSAGE_LENGTH - truncateMsg.length) + truncateMsg;
                    console.log(`[QQ-Channel] Truncated long message from ${payload.text.length} to ${replyText.length} chars`);
                  }

                  // Log the message size for debugging
                  console.log(`[QQ-Channel] Message size: ${replyText.length} chars, content preview: ${replyText.slice(0, 80).replace(/\n/g, ' ')}...`);

                  // Deduplication: Skip if we already sent the same reply to this message recently
                  const messageKey = `${message.channel_id}:${message.id}`;
                  const lastReply = recentReplies.get(messageKey);
                  const now = Date.now();

                  if (lastReply && lastReply.text === replyText && (now - lastReply.timestamp) < REPLY_DEDUP_WINDOW_MS) {
                    console.log('[QQ-Channel] Skipping duplicate reply to message:', message.id);
                    return;
                  }

                  console.log('[QQ-Channel] Sending AI reply:', replyText.slice(0, 100) + (replyText.length > 100 ? '...' : ''));

                  // Use different API for direct messages vs channel messages
                  if (isDirect && message.guild_id) {
                    // For DMs, use /dms/{guild_id}/messages
                    await client.sendDirectMessage(message.guild_id, {
                      content: replyText,
                      msg_id: message.id,  // Reply to the original message
                    });
                  } else {
                    // For channel messages, use /channels/{channel_id}/messages
                    await client.sendChannelMessage(message.channel_id, {
                      content: replyText,
                      msg_id: message.id,  // Reply to the original message
                    });
                  }

                  // Record this reply
                  recentReplies.set(messageKey, { text: replyText, timestamp: now });

                  // Cleanup old entries
                  for (const [key, value] of recentReplies.entries()) {
                    if (now - value.timestamp > REPLY_DEDUP_WINDOW_MS) {
                      recentReplies.delete(key);
                    }
                  }

                  console.log('[QQ-Channel] AI reply sent successfully');
                },
                onError: (err, info) => {
                  console.error(`[QQ-Channel] ${info.kind} reply failed:`, err);
                },
              },
            });
          } catch (err) {
            console.error('[QQ-Channel] Failed to dispatch reply:', err);
          }
        },

        onReady: (sessionId: string, botUser: { id: string; username: string }) => {
          console.log(`[QQ-Channel] Account ${accountId} ready: ${botUser.username} (${botUser.id})`);
        },

        onError: (error: Error) => {
          console.error(`[QQ-Channel] Account ${accountId} error:`, error);
        },
      });

      activeRuntimes.set(accountId, runtime);

      // Start the runtime
      await runtime.start();

      // Return stop handler
      return async () => {
        const rt = activeRuntimes.get(accountId);
        if (rt) {
          await rt.stop();
          activeRuntimes.delete(accountId);
          apiClients.delete(accountId);
        }
      };
    },
  },
};
