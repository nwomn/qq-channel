/**
 * Type declarations for Clawdbot Plugin SDK
 * These types are used at compile time; actual implementation comes from Clawdbot at runtime
 */

export type MoltbotConfig = any;

export interface ReplyPayload {
  text: string;
  metadata?: {
    model?: string;
  };
  model?: string;
}

export interface RuntimeLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface RuntimeEnv {
  log: (...args: any[]) => void;
  error?: (...args: any[]) => void;
  exit: (code: number) => never;
}

export interface InboundContext {
  Body: string;
  RawBody: string;
  CommandBody: string;
  From: string;
  To: string;
  SessionKey: string;
  AccountId?: string;
  ChatType: 'direct' | 'channel' | 'group';
  ConversationLabel: string;
  SenderName: string;
  SenderId: string;
  SenderUsername?: string;
  GroupSubject?: string;
  GroupChannel?: string;
  GroupSystemPrompt?: string;
  Provider: string;
  Surface: string;
  WasMentioned?: boolean;
  MessageSid: string;
  ReplyToId?: string;
  MessageThreadId?: string;
  Timestamp?: number;
  MediaPath?: string;
  MediaType?: string;
  MediaUrl?: string;
  CommandAuthorized?: boolean;
  CommandSource?: string;
  OriginatingChannel: string;
  OriginatingTo: string;
}

export interface AgentRoute {
  sessionKey: string;
  mainSessionKey?: string;
  accountId?: string;
  agentId?: string;
  model?: string;
}

export interface PluginRuntime {
  version: string;
  config: {
    loadConfig: () => MoltbotConfig;
    writeConfigFile: (cfg: MoltbotConfig) => Promise<void>;
  };
  channel: {
    text: {
      chunkMarkdownText: (text: string, limit: number) => string[];
      hasControlCommand: (text: string, cfg: MoltbotConfig) => boolean;
    };
    reply: {
      formatAgentEnvelope: (params: {
        channel: string;
        from: string;
        timestamp?: number;
        previousTimestamp?: number;
        envelope?: any;
        body: string;
      }) => string;
      finalizeInboundContext: (ctx: Partial<InboundContext>) => InboundContext;
      resolveEffectiveMessagesConfig: (cfg: MoltbotConfig, agentId?: string) => { responsePrefix?: string };
      resolveHumanDelayConfig: (cfg: MoltbotConfig, agentId?: string) => any;
      dispatchReplyWithBufferedBlockDispatcher: (params: {
        ctx: InboundContext;
        cfg: MoltbotConfig;
        dispatcherOptions: {
          responsePrefix?: string;
          humanDelay?: any;
          deliver: (payload: ReplyPayload) => Promise<void>;
          onError?: (err: Error, info: { kind: string }) => void;
        };
      }) => Promise<void>;
    };
    routing: {
      resolveAgentRoute: (params: {
        cfg: MoltbotConfig;
        channel: string;
        accountId?: string;
        peer: {
          kind: 'dm' | 'group' | 'channel';
          id: string;
        };
      }) => AgentRoute;
    };
  };
  logging: {
    shouldLogVerbose: () => boolean;
    getChildLogger: (bindings?: Record<string, unknown>, opts?: { level?: string }) => RuntimeLogger;
  };
  [key: string]: any;
}

export interface ClawdbotPluginApi {
  runtime: PluginRuntime;
  registerChannel: (registration: { plugin: ChannelPlugin<any> }) => void;
}

export interface ChannelCapabilities {
  chatTypes: string[];
  reactions: boolean;
  threads: boolean;
  media: boolean;
  nativeCommands: boolean;
  blockStreaming: boolean;
}

export interface ChannelMeta {
  label: string;
  docsPath?: string;
  blurb?: string;
}

export interface ChannelConfigSchema {
  type: string;
  properties: Record<string, any>;
}

export interface ChannelPlugin<TAccount> {
  id: string;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;
  reload?: {
    configPrefixes: string[];
  };
  configSchema: ChannelConfigSchema;
  config: {
    listAccountIds: (cfg: any) => string[];
    resolveAccount: (cfg: any, accountId: string) => TAccount | null;
    defaultAccountId: (cfg?: any) => string;
    isConfigured: (account: TAccount | null) => boolean;
    describeAccount: (account: TAccount) => {
      name: string;
      fields: Record<string, string>;
    };
  };
  outbound: {
    deliveryMode: 'direct' | 'batch';
    textChunkLimit: number;
    sendText: (params: {
      to: string;
      text: string;
      accountId: string;
      replyToId?: string;
      threadId?: string;
      deps?: any;
    }) => Promise<{ messageId: string; timestamp: Date }>;
    sendMedia?: (params: {
      to: string;
      text?: string;
      mediaUrl: string;
      accountId: string;
      replyToId?: string;
      threadId?: string;
      deps?: any;
    }) => Promise<{ messageId: string; timestamp: Date }>;
  };
  status?: {
    defaultRuntime: {
      accountId: string;
      running: boolean;
      lastStartAt: Date | null;
      lastStopAt: Date | null;
      lastError: string | null;
    };
    buildChannelSummary: (params?: any) => { health: string };
    buildAccountSnapshot: (params: { account: TAccount; runtime?: any }) => any;
  };
  gateway: {
    startAccount: (ctx: GatewayContext) => Promise<(() => Promise<void>) | null>;
  };
}

export interface GatewayContext {
  accountId: string;
  cfg: any;
  pushInbound: (message: InboundMessage) => void;
}

export interface InboundMessage {
  messageId: string;
  channelId: string;
  threadId?: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: Date;
  isDirect: boolean;
  raw: unknown;
}

export function emptyPluginConfigSchema(): any {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {},
  };
}
