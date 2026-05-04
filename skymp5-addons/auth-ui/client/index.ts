import { ensureClientAddonHostGlobal } from "../../../skymp5-addons-api/clientAddonHost";
import { registerAuthUiPlugin } from "./authUiPlugin";
import { AUTH_UI_PLUGIN_ID } from "../shared/authUiProtocol";

ensureClientAddonHostGlobal().registerClientAddon(AUTH_UI_PLUGIN_ID, (api) => {
  registerAuthUiPlugin(api);
});
