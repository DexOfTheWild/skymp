"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const clientPluginHost_1 = require("../../skymp5-plugin-api/clientPluginHost");
const exampleProtocol_1 = require("../shared/exampleProtocol");
const exampleClientPlugin_1 = require("./exampleClientPlugin");
(0, clientPluginHost_1.ensureClientPluginHostGlobal)().registerClientPlugin(exampleProtocol_1.EXAMPLE_PLUGIN_ID, (api) => {
    (0, exampleClientPlugin_1.registerExampleClientPlugin)(api);
});
