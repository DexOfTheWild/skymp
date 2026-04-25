"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerExampleClientPlugin = void 0;
const exampleProtocol_1 = require("../shared/exampleProtocol");
const SECURE_ORIGIN_AUDIO_CAPTURE = "secureOriginAudioCapture";
const registerExampleClientPlugin = (api) => {
    api.log("Example plugin init", {
        capabilities: api.capabilities,
        version: api.version,
    });
    api.registerConsoleCommand("exampleplugin", (args, context) => {
        context.printConsole(`[mp ${context.commandName}] plugin=${context.pluginId} args=${args.join(" ") || "(none)"}`);
        api.browser.emitEvent(exampleProtocol_1.EXAMPLE_BROWSER_EVENT, JSON.stringify({
            args,
            source: "console",
        }));
        return true;
    });
    api.onLocalSpawn((event) => {
        api.log("Example plugin local spawn", event);
        if (api.capabilities.browser.mediaPermissionPolicies.includes(SECURE_ORIGIN_AUDIO_CAPTURE)) {
            api.browser.setMediaPermissionPolicy(SECURE_ORIGIN_AUDIO_CAPTURE);
        }
        api.browser.emitEvent(exampleProtocol_1.EXAMPLE_BROWSER_EVENT, JSON.stringify({
            pluginId: exampleProtocol_1.EXAMPLE_PLUGIN_ID,
            profileId: event.profileId,
            source: "localSpawn",
        }));
    });
    api.onCustomPacket(exampleProtocol_1.EXAMPLE_SERVER_WELCOME_PACKET_TYPE, (payload) => {
        api.log("Example plugin welcome packet", payload);
    });
    api.onCustomPacket(exampleProtocol_1.EXAMPLE_SERVER_PONG_PACKET_TYPE, (payload) => {
        api.log("Example plugin pong packet", payload);
    });
};
exports.registerExampleClientPlugin = registerExampleClientPlugin;
