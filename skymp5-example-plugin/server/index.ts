import {
  ServerPlugin,
  ServerPluginApi,
  ServerPluginModule,
} from "../../skymp5-plugin-api/serverPluginHost";
import {
  createExamplePongPacket,
  createExampleWelcomePacket,
  EXAMPLE_CLIENT_PING_PACKET_TYPE,
  EXAMPLE_PLUGIN_ID,
  ExamplePluginServerConfig,
} from "../shared/exampleProtocol";

class ExampleServerPlugin implements ServerPlugin {
  public systemName = "ExampleServerPlugin";

  public constructor(
    private api: ServerPluginApi,
    private config: ExamplePluginServerConfig,
  ) {
    this.api.onSpawnAllowed((userId, profileId) => {
      this.api.log("Example plugin spawn allowed", {
        profileId,
        userId,
      });
      this.api.sendCustomPacket(userId, createExampleWelcomePacket({
        greeting: this.getGreeting(),
        profileId,
      }));
    });

    this.api.onCustomPacket(EXAMPLE_CLIENT_PING_PACKET_TYPE, async (userId, content) => {
      this.api.log("Example plugin ping", {
        content,
        userId,
      });
      this.api.sendCustomPacket(userId, createExamplePongPacket({
        greeting: this.getGreeting(),
        received: content,
      }));
    });
  }

  public init(): void {
    this.api.log("Example server plugin init", {
      capabilities: this.api.capabilities,
      config: this.config,
      hasActorAngleZ: this.api.capabilities.actorAngleZ,
    });
  }

  public dispose(): void {
    this.api.log("Example server plugin dispose");
  }

  private getGreeting(): string {
    return typeof this.config.greeting === "string" && this.config.greeting.trim().length > 0
      ? this.config.greeting.trim()
      : "Hello from the example server plugin";
  }
}

export const pluginId = EXAMPLE_PLUGIN_ID;

export const createServerPlugin: ServerPluginModule["createServerPlugin"] = (
  api,
  config,
) => {
  return new ExampleServerPlugin(api, (config || {}) as ExamplePluginServerConfig);
};
