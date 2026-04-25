"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServerPlugin = exports.pluginId = void 0;
const exampleProtocol_1 = require("../shared/exampleProtocol");
class ExampleServerPlugin {
    api;
    config;
    systemName = "ExampleServerPlugin";
    constructor(api, config) {
        this.api = api;
        this.config = config;
        this.api.onSpawnAllowed((userId, profileId) => {
            this.api.log("Example plugin spawn allowed", {
                profileId,
                userId,
            });
            this.api.sendCustomPacket(userId, (0, exampleProtocol_1.createExampleWelcomePacket)({
                greeting: this.getGreeting(),
                profileId,
            }));
        });
        this.api.onCustomPacket(exampleProtocol_1.EXAMPLE_CLIENT_PING_PACKET_TYPE, async (userId, content) => {
            this.api.log("Example plugin ping", {
                content,
                userId,
            });
            this.api.sendCustomPacket(userId, (0, exampleProtocol_1.createExamplePongPacket)({
                greeting: this.getGreeting(),
                received: content,
            }));
        });
    }
    init() {
        this.api.log("Example server plugin init", {
            capabilities: this.api.capabilities,
            config: this.config,
            hasActorAngleZ: this.api.capabilities.actorAngleZ,
        });
    }
    dispose() {
        this.api.log("Example server plugin dispose");
    }
    getGreeting() {
        return typeof this.config.greeting === "string" && this.config.greeting.trim().length > 0
            ? this.config.greeting.trim()
            : "Hello from the example server plugin";
    }
}
exports.pluginId = exampleProtocol_1.EXAMPLE_PLUGIN_ID;
const createServerPlugin = (api, config) => {
    return new ExampleServerPlugin(api, (config || {}));
};
exports.createServerPlugin = createServerPlugin;
