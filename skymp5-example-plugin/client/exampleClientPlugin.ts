import {
  ClientPluginApi,
  ClientPluginBrowserMediaPermissionPolicy,
} from "../../skymp5-plugin-api/clientPluginHost";
import {
  EXAMPLE_BROWSER_EVENT,
  EXAMPLE_PLUGIN_ID,
  EXAMPLE_SERVER_PONG_PACKET_TYPE,
  EXAMPLE_SERVER_WELCOME_PACKET_TYPE,
} from "../shared/exampleProtocol";

const SECURE_ORIGIN_AUDIO_CAPTURE =
  "secureOriginAudioCapture" as ClientPluginBrowserMediaPermissionPolicy;

export const registerExampleClientPlugin = (api: ClientPluginApi): void => {
  api.log("Example plugin init", {
    capabilities: api.capabilities,
    version: api.version,
  });

  api.registerConsoleCommand("exampleplugin", (args, context) => {
    context.printConsole(
      `[mp ${context.commandName}] plugin=${context.pluginId} args=${args.join(" ") || "(none)"}`,
    );
    api.browser.emitEvent(
      EXAMPLE_BROWSER_EVENT,
      JSON.stringify({
        args,
        source: "console",
      }),
    );
    return true;
  });

  api.onLocalSpawn((event) => {
    api.log("Example plugin local spawn", event);

    if (api.capabilities.browser.mediaPermissionPolicies.includes(SECURE_ORIGIN_AUDIO_CAPTURE)) {
      api.browser.setMediaPermissionPolicy(SECURE_ORIGIN_AUDIO_CAPTURE);
    }

    api.browser.emitEvent(
      EXAMPLE_BROWSER_EVENT,
      JSON.stringify({
        pluginId: EXAMPLE_PLUGIN_ID,
        profileId: event.profileId,
        source: "localSpawn",
      }),
    );
  });

  api.onCustomPacket(EXAMPLE_SERVER_WELCOME_PACKET_TYPE, (payload) => {
    api.log("Example plugin welcome packet", payload);
  });
  api.onCustomPacket(EXAMPLE_SERVER_PONG_PACKET_TYPE, (payload) => {
    api.log("Example plugin pong packet", payload);
  });
};
