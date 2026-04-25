import { ServerPluginModule } from "../../../../skymp5-plugin-api/serverPluginHost";
import { pushServerPluginLoaderTestEvent } from "./serverPluginLoaderTestState";

export const pluginId = "loader-fixture";

export const createServerPlugin: ServerPluginModule["createServerPlugin"] = (
  api,
) => {
  pushServerPluginLoaderTestEvent("duplicateCreateServerPlugin", {
    pluginId: api.pluginId,
  });
  return {
    systemName: "DuplicatePlugin",
  };
};
