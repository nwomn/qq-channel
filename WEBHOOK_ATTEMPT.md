# Webhook 模式迁移尝试记录

## 背景

QQ 频道机器人 WebSocket 模式存在 session 配额限制问题，尝试迁移到 Webhook 模式以解决此问题。

## 实现内容

### 新增文件
- `src/webhook/server.ts` - HTTP 服务器，接收 QQ 回调
- `src/webhook/signature.ts` - Ed25519 签名验证和生成
- `src/webhook/handler.ts` - 事件处理适配器

### 修改文件
- `src/types.ts` - 添加 Webhook 相关类型定义
- `src/channel.ts` - 支持 WebSocket/Webhook 双模式切换
- `package.json` - 添加 `@noble/ed25519` 和 `@noble/hashes` 依赖

## 签名算法实现

根据 QQ 官方文档，URL 验证回调的签名流程：

1. 从 `botSecret` 派生 32 字节 seed：
   ```go
   seed := botSecret
   for len(seed) < ed25519.SeedSize {
       seed = strings.Repeat(seed, 2)
   }
   seed = seed[:ed25519.SeedSize]
   ```

2. 使用 seed 生成 Ed25519 密钥对

3. 签名消息格式：`eventTs + plainToken`

4. 返回响应：`{"plain_token": "...", "signature": "hex_encoded_signature"}`

## 遇到的障碍

### 1. HTTPS 证书问题

QQ Webhook 回调要求 HTTPS，且只支持 80、443、8080、8443 端口。

尝试过的方案：
- **Cloudflare Tunnel (trycloudflare.com)** - 可用，但签名验证失败
- **DuckDNS + Let's Encrypt** - Let's Encrypt 无法查询 DuckDNS 的 TXT 记录（DNS 超时）
- **自签名证书** - QQ 不信任，请求根本不会发送到服务器

### 2. 签名验证失败（核心问题）

使用 Cloudflare Tunnel 后，QQ 的验证请求能够到达服务器，但始终返回"签名校验失败"。

**已验证的内容：**
- 签名算法使用 `@noble/ed25519` 和 Node.js 原生 `crypto` 模块，两者结果一致
- Seed 派生逻辑与 Go 代码一致（字符串重复直到 32 字节）
- 消息格式为 `eventTs + plainToken`
- 响应格式正确

**问题所在：**
使用 QQ 文档中的示例数据（secret: `D65g384j9X2KOErG`）验证时，我们生成的签名与文档中的预期签名**不匹配**：
- 我们的签名：`ea814456956529d41921b9ad4367168696ef1fe0...`
- 文档预期：`87bef09c42c651b3aac0278e71ada38431ae26fcb...`

**可能的原因：**
1. 文档中的示例签名可能是用不同的 secret 生成的（文档错误）
2. QQ 的 Ed25519 实现可能与标准实现有差异
3. 可能存在未公开的额外处理步骤
4. AppSecret 和 "机器人密钥" 可能是两个不同的值

### 3. 网络环境限制

服务器位于中国大陆阿里云，直接访问外网受限：
- 需要通过代理访问外部服务
- Let's Encrypt 验证失败（连接重置）
- DNS 查询超时

## 待解决

1. 确认 QQ 开放平台中 AppSecret 和机器人密钥是否为同一值
2. 联系 QQ 官方确认签名算法的具体实现细节
3. 或等待 QQ 提供更详细的调试信息

## 配置示例

```json
{
  "qq-channel": {
    "appId": 102824573,
    "appSecret": "your_app_secret",
    "botToken": "your_bot_token",
    "connectionMode": "webhook",
    "webhook": {
      "port": 19080,
      "path": "/webhook"
    }
  }
}
```

## 相关文档

- QQ 机器人 Webhook 文档：https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html
- QQ 机器人签名验证：https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/sign.html
