import { ensureClientPluginHostGlobal } from "../../skymp5-plugin-api/clientPluginHost";
import { registerVoipClientPlugin } from "./voipClientPlugin";

ensureClientPluginHostGlobal().registerClientPlugin("voip", (api) => {
  registerVoipClientPlugin(api);
});
