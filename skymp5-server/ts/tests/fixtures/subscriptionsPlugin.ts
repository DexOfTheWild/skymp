import {
  ServerPlugin,
  ServerPluginModule,
} from "../../../../skymp5-plugin-api/serverPluginHost";
import { pushServerPluginLoaderTestEvent } from "./serverPluginLoaderTestState";

type LoaderFixtureConfig = {
  greeting?: string;
};

class SubscriptionsPlugin implements ServerPlugin {
  public systemName = "SubscriptionsPlugin";

  public constructor(
    private greeting: string,
    private actorAngleSnapshot: number | null,
  ) {}

  public init(): void {
    pushServerPluginLoaderTestEvent("init", {
      actorAngleSnapshot: this.actorAngleSnapshot,
      greeting: this.greeting,
    });
  }

  public customPacket(userId: number, type: string, content: Record<string, unknown>): void {
    pushServerPluginLoaderTestEvent("legacyCustomPacket", {
      content,
      type,
      userId,
    });
  }

  public dispose(): void {
    pushServerPluginLoaderTestEvent("dispose");
  }
}

export const pluginId = "loader-fixture";

export const createServerPlugin: ServerPluginModule["createServerPlugin"] = (
  api,
  config,
) => {
  pushServerPluginLoaderTestEvent("createServerPlugin", {
    capabilities: api.capabilities,
    config,
    pluginId: api.pluginId,
  });

  api.onSpawnAllowed((userId, profileId) => {
    pushServerPluginLoaderTestEvent("spawnAllowed", {
      profileId,
      userId,
    });
  });
  api.onCustomPacket("loader:test", async (userId, content) => {
    pushServerPluginLoaderTestEvent("typedCustomPacket", {
      content,
      userId,
    });
  });

  return new SubscriptionsPlugin(
    ((config || {}) as LoaderFixtureConfig).greeting || "hi",
    api.getActorAngleZ(123),
  );
};
