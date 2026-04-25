import { ensureClientPluginHostGlobal } from "../../skymp5-plugin-api/clientPluginHost";
import { EXAMPLE_PLUGIN_ID } from "../shared/exampleProtocol";
import { registerExampleClientPlugin } from "./exampleClientPlugin";

ensureClientPluginHostGlobal().registerClientPlugin(EXAMPLE_PLUGIN_ID, (api) => {
  registerExampleClientPlugin(api);
});
