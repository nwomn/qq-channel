/**
 * QQ Channel Plugin for Clawdbot
 * Entry point - registers the channel plugin with the Clawdbot API
 */

import type { ClawdbotPluginApi } from "./src/sdk-types.js";
import { emptyPluginConfigSchema } from "./src/sdk-types.js";
import { qqChannelPlugin } from './src/channel.js';
import { setQQRuntime } from './src/runtime.js';

const plugin = {
  id: "qq-channel",
  name: "QQ Channel",
  description: "QQ Channel bot integration for Clawdbot",
  configSchema: emptyPluginConfigSchema(),
  register(api: ClawdbotPluginApi) {
    console.log('[QQ-Channel] Registering QQ Channel plugin');
    setQQRuntime(api.runtime);
    api.registerChannel({ plugin: qqChannelPlugin });
    console.log('[QQ-Channel] Plugin registered successfully');
  },
};

export default plugin;
