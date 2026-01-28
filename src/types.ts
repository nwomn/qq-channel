/**
 * QQ Channel Bot API Types
 */

// OAuth token response
export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Gateway response
export interface GatewayResponse {
  url: string;
  shards: number;
  session_start_limit: {
    total: number;
    remaining: number;
    reset_after: number;
    max_concurrency: number;
  };
}

// WebSocket payload structure
export interface WSPayload<T = unknown> {
  op: OpCode;
  d: T;
  s?: number;
  t?: string;
}

// WebSocket opcodes
export enum OpCode {
  Dispatch = 0,
  Heartbeat = 1,
  Identify = 2,
  Resume = 6,
  Reconnect = 7,
  InvalidSession = 9,
  Hello = 10,
  HeartbeatAck = 11,
}

// Hello payload
export interface HelloPayload {
  heartbeat_interval: number;
}

// Identify payload
export interface IdentifyPayload {
  token: string;
  intents: number;
  shard: [number, number];
  properties?: {
    $os: string;
    $browser: string;
    $device: string;
  };
}

// Ready event payload
export interface ReadyPayload {
  version: number;
  session_id: string;
  user: BotUser;
  shard: [number, number];
}

// Bot user
export interface BotUser {
  id: string;
  username: string;
  avatar?: string;
  bot: boolean;
}

// Message author
export interface MessageAuthor {
  id: string;
  username: string;
  avatar?: string;
  bot: boolean;
}

// Guild member info
export interface GuildMember {
  joined_at: string;
  roles: string[];
  nick?: string;
}

// Message event payload (AT_MESSAGE_CREATE, DIRECT_MESSAGE_CREATE)
export interface MessagePayload {
  id: string;
  channel_id: string;
  guild_id: string;
  content: string;
  timestamp: string;
  author: MessageAuthor;
  member?: GuildMember;
  seq?: number;
  seq_in_channel?: string;
}

// Send message request
export interface SendMessageRequest {
  content?: string;
  msg_id?: string;
  embed?: unknown;
  ark?: unknown;
  image?: string;
  message_reference?: {
    message_id: string;
    ignore_get_message_error?: boolean;
  };
}

// Send message response
export interface SendMessageResponse {
  id: string;
  channel_id: string;
  guild_id: string;
  content: string;
  timestamp: string;
  author: MessageAuthor;
}

// Intent flags for subscribing to events
export enum Intents {
  GUILDS = 1 << 0,
  GUILD_MEMBERS = 1 << 1,
  GUILD_MESSAGES = 1 << 9,
  GUILD_MESSAGE_REACTIONS = 1 << 10,
  DIRECT_MESSAGE = 1 << 12,
  INTERACTION = 1 << 26,
  MESSAGE_AUDIT = 1 << 27,
  FORUMS_EVENT = 1 << 28,
  AUDIO_ACTION = 1 << 29,
  PUBLIC_GUILD_MESSAGES = 1 << 30,
}

// Event types
export type EventType =
  | 'READY'
  | 'RESUMED'
  | 'GUILD_CREATE'
  | 'GUILD_UPDATE'
  | 'GUILD_DELETE'
  | 'CHANNEL_CREATE'
  | 'CHANNEL_UPDATE'
  | 'CHANNEL_DELETE'
  | 'GUILD_MEMBER_ADD'
  | 'GUILD_MEMBER_UPDATE'
  | 'GUILD_MEMBER_REMOVE'
  | 'MESSAGE_CREATE'
  | 'AT_MESSAGE_CREATE'
  | 'DIRECT_MESSAGE_CREATE'
  | 'MESSAGE_REACTION_ADD'
  | 'MESSAGE_REACTION_REMOVE';

// Account configuration
export interface QQChannelAccount {
  appId: string;
  appSecret: string;
  botToken: string;
  sandbox?: boolean;
}

// DMS (Direct Message Session) response
export interface DMSResponse {
  guild_id: string;
  channel_id: string;
  create_time: string;
}
