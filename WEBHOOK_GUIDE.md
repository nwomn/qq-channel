# QQ 频道机器人 Webhook 模式指南

## 概述

QQ 频道机器人插件现在支持两种连接模式：

- **WebSocket 模式**（默认）：传统模式，需要消耗 session 配额
- **Webhook 模式**（新增）：通过 HTTP 回调接收消息，无 session 配额限制

## Webhook 模式优势

1. **无 session 配额限制**：不再受到每日连接次数限制
2. **更稳定**：避免 WebSocket 断线重连问题
3. **更高效**：按需接收消息，无需保持长连接

## 配置方式

### 方式 1：直接配置（单账号）

```yaml
channels:
  qq-channel:
    appId: "your_app_id"
    appSecret: "your_app_secret"
    botToken: "your_bot_token"
    connectionMode: webhook  # 使用 webhook 模式
    webhook:
      port: 8080              # HTTP 服务器端口
      host: "0.0.0.0"         # 监听地址（可选，默认 0.0.0.0）
      path: "/webhook"        # 回调路径（可选，默认 /webhook）
```

### 方式 2：多账号配置

```yaml
channels:
  qq-channel:
    accounts:
      bot1:
        appId: "bot1_app_id"
        appSecret: "bot1_app_secret"
        botToken: "bot1_bot_token"
        connectionMode: webhook
        webhook:
          port: 8080
          path: "/webhook/bot1"

      bot2:
        appId: "bot2_app_id"
        appSecret: "bot2_app_secret"
        botToken: "bot2_bot_token"
        connectionMode: websocket  # 可混用 WebSocket 和 Webhook
```

## 部署步骤

### 1. 配置 Clawdbot

在 Clawdbot 配置文件中启用 Webhook 模式（如上所示）。

### 2. 启动 Clawdbot

```bash
npm start
```

启动后会看到类似日志：

```
[QQ-Channel] Starting account default in webhook mode
[QQ-Channel Webhook] Server listening on 0.0.0.0:8080/webhook
```

### 3. 配置 HTTPS 访问

**重要**：QQ 开放平台要求回调 URL 必须使用 HTTPS。你需要使用反向代理提供 HTTPS 访问。

#### 选项 A：使用 Cloudflare Tunnel（推荐）

Cloudflare Tunnel 提供免费的 HTTPS 支持，无需域名和证书配置。

**安装 cloudflared：**

```bash
# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# macOS
brew install cloudflared

# Windows
# 下载 .exe 文件从 https://github.com/cloudflare/cloudflared/releases
```

**快速测试（临时 URL）：**

```bash
cloudflared tunnel --url http://localhost:8080
```

这会输出类似：`https://random-name.trycloudflare.com`，可用于临时测试。

**持久化部署（需要 Cloudflare 账号）：**

1. 登录 Cloudflare：
```bash
cloudflared tunnel login
```

2. 创建 tunnel：
```bash
cloudflared tunnel create qq-bot
```

3. 配置 tunnel（`~/.cloudflared/config.yml`）：
```yaml
tunnel: qq-bot
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: qq-bot.your-domain.com  # 替换为你的域名
    service: http://localhost:8080
  - service: http_status:404
```

4. 在 Cloudflare DNS 中添加记录：
```bash
cloudflared tunnel route dns qq-bot qq-bot.your-domain.com
```

5. 运行 tunnel：
```bash
cloudflared tunnel run qq-bot
```

6. 使用 systemd 自动启动（可选）：
```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

#### 选项 B：使用 Nginx + Let's Encrypt

如果你有自己的服务器和域名：

```nginx
server {
    listen 443 ssl;
    server_name qq-bot.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/qq-bot.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/qq-bot.your-domain.com/privkey.pem;

    location /webhook {
        proxy_pass http://localhost:8080/webhook;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4. 在 QQ 开放平台配置回调地址

1. 访问 [QQ 开放平台](https://q.qq.com/)
2. 进入你的机器人应用管理页面
3. 找到"开发设置" → "回调配置"
4. 填写回调 URL：
   - 格式：`https://your-domain.com/webhook`
   - 示例：`https://qq-bot.your-domain.com/webhook`
5. 点击"保存并验证"

如果配置正确，QQ 平台会发送验证请求，你会在日志中看到：

```
[QQ-Channel Webhook] Received payload: { op: 13, t: undefined, id: undefined }
[QQ-Channel Webhook] URL validation request: { plain_token: '...', event_ts: '...' }
[QQ-Channel Webhook] URL validation response: { plain_token: '...', signature: '...' }
```

验证通过后，回调地址配置完成。

### 5. 测试

在 QQ 频道中 @你的机器人发送消息，观察日志：

```
[QQ-Channel Webhook] Received payload: { op: 0, t: 'AT_MESSAGE_CREATE', id: '...' }
[QQ-Channel Webhook] Handling event: AT_MESSAGE_CREATE
[QQ-Channel] Received message: { id: '...', content: '@机器人 你好', ... }
[QQ-Channel] Dispatching to AI with session: ...
[QQ-Channel] Sending AI reply: ...
[QQ-Channel] AI reply sent successfully
```

## 故障排查

### 回调验证失败

**问题**：QQ 平台显示"验证失败"

**解决方法**：
1. 确认 Webhook 服务器已启动
2. 确认 HTTPS 配置正确
3. 检查防火墙是否允许访问
4. 查看 Clawdbot 日志中是否收到验证请求

### 收不到消息

**问题**：验证通过但收不到消息

**解决方法**：
1. 确认机器人已加入频道
2. 确认在消息中 @了机器人
3. 检查机器人是否有相应的权限和 intents
4. 查看日志确认是否收到事件

### 签名验证失败

**问题**：日志显示"Signature verification failed"

**解决方法**：
1. 确认 `appSecret` 配置正确
2. 确认请求头中包含 `X-Signature-Ed25519` 和 `X-Signature-Timestamp`
3. 检查时钟同步（NTP）

### 端口被占用

**问题**：启动失败，提示端口被占用

**解决方法**：
1. 更改配置中的 `webhook.port`
2. 或者停止占用端口的进程：
```bash
# 查找占用端口的进程
lsof -i :8080
# 或者
netstat -tulpn | grep 8080
```

## WebSocket vs Webhook 对比

| 特性 | WebSocket 模式 | Webhook 模式 |
|------|---------------|-------------|
| Session 配额 | 受限（每日约 500 次） | 无限制 |
| 稳定性 | 需要保持连接 | 无需保持连接 |
| 部署要求 | 无特殊要求 | 需要 HTTPS |
| 延迟 | 低 | 略高（HTTP 开销） |
| 适用场景 | 测试、小规模 | 生产、大规模 |

## 迁移建议

1. **测试环境**：使用 WebSocket 模式快速测试
2. **生产环境**：使用 Webhook 模式避免配额限制
3. **混合部署**：可以同时使用两种模式（不同账号）

## 安全建议

1. **签名验证**：Webhook 模式会自动验证 QQ 平台的签名，确保请求真实性
2. **防火墙**：只允许 QQ 平台的 IP 访问（可选）
3. **路径混淆**：使用非标准路径（如 `/webhook/secret-path-12345`）

## 更多信息

- [QQ 开放平台文档](https://bot.q.qq.com/wiki/)
- [Cloudflare Tunnel 文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
