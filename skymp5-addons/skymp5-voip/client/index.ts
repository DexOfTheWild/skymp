import { ensureClientAddonHostGlobal } from "../../../skymp5-addons-api/clientAddonHost";
import { registerVoipClientAddon } from "./voipClientAddon";

ensureClientAddonHostGlobal().registerClientAddon("voip", (api) => {
  registerVoipClientAddon(api);
});
