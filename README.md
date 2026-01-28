# QQ Channel Plugin for Clawdbot

QQ 频道机器人插件，为 [Clawdbot](https://github.com/moltbot/moltbot) 提供 QQ 频道支持。

## 功能特性

- WebSocket 实时连接 QQ 频道
- 支持频道消息和私聊消息
- 集成 Clawdbot AI 回复系统
- 自动心跳维持和断线重连
- 使用官方 Access Token 认证方式

## 前置要求

1. 已安装并运行 [Clawdbot](https://github.com/moltbot/moltbot)
2. QQ 开放平台账号和机器人应用
   - 访问 [QQ 开放平台](https://q.qq.com/) 注册
   - 创建机器人应用，获取 AppID、AppSecret 和 Token
   - 配置 IP 白名单（将服务器 IP 添加到白名单）

## 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/qq-channel.git
cd qq-channel

# 安装依赖
npm install

# 构建
npm run build

# 安装到 Clawdbot（链接模式，开发用）
clawdbot plugins install -l /path/to/qq-channel

# 启用插件
clawdbot plugins enable qq-channel
```

## 配置

在 Clawdbot 配置文件 (`~/.clawdbot/clawdbot.json`) 中添加：

```json
{
  "channels": {
    "qq-channel": {
      "appId": "你的AppID",
      "appSecret": "你的AppSecret",
      "botToken": "你的Token",
      "sandbox": false,
      "enabled": true
    }
  }
}
```

或使用命令行配置：

```bash
clawdbot config set channels.qq-channel.appId "你的AppID"
clawdbot config set channels.qq-channel.appSecret "你的AppSecret"
clawdbot config set channels.qq-channel.botToken "你的Token"
clawdbot config set channels.qq-channel.enabled true
```

## 使用

配置完成后，重启 Clawdbot Gateway：

```bash
clawdbot gateway restart
```

查看状态：

```bash
clawdbot channels status
```

在 QQ 频道中 @机器人 或私聊机器人即可触发 AI 回复。

## 项目结构

```
qq-channel/
├── package.json            # NPM 包配置
├── tsconfig.json           # TypeScript 配置
├── clawdbot.plugin.json    # Clawdbot 插件声明
├── index.ts                # 插件入口
└── src/
    ├── channel.ts          # ChannelPlugin 实现
    ├── runtime.ts          # WebSocket 运行时
    ├── types.ts            # QQ API 类型定义
    ├── sdk-types.ts        # Clawdbot SDK 类型声明
    └── api/
        └── client.ts       # QQ HTTP API 客户端
```

## API 说明

### WebSocket 事件

| 事件 | 说明 |
|------|------|
| `AT_MESSAGE_CREATE` | 频道中 @机器人 的消息 |
| `DIRECT_MESSAGE_CREATE` | 私聊消息 |

### HTTP API

| 端点 | 说明 |
|------|------|
| `POST /channels/{channel_id}/messages` | 发送频道消息 |
| `POST /dms/{guild_id}/messages` | 发送私聊消息 |
| `GET /gateway/bot` | 获取 WebSocket 网关地址 |

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式（开发时使用）
npm run watch
```

## 注意事项

1. **IP 白名单**：必须在 QQ 开放平台配置服务器 IP 白名单，否则会报 401 错误
2. **Access Token**：使用新的 `QQBot {access_token}` 认证方式，旧的 `Bot {appId}.{token}` 方式已废弃
3. **被动消息**：回复消息需要携带原消息的 `msg_id`，否则可能发送失败

## 许可证

MIT
