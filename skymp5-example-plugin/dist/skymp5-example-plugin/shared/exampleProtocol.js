"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExamplePingPacket = exports.createExamplePongPacket = exports.createExampleWelcomePacket = exports.EXAMPLE_SERVER_PONG_PACKET_TYPE = exports.EXAMPLE_SERVER_WELCOME_PACKET_TYPE = exports.EXAMPLE_CLIENT_PING_PACKET_TYPE = exports.EXAMPLE_BROWSER_EVENT = exports.EXAMPLE_PLUGIN_ID = void 0;
exports.EXAMPLE_PLUGIN_ID = "example";
exports.EXAMPLE_BROWSER_EVENT = "skymp5-example:state";
exports.EXAMPLE_CLIENT_PING_PACKET_TYPE = "example:ping";
exports.EXAMPLE_SERVER_WELCOME_PACKET_TYPE = "example:welcome";
exports.EXAMPLE_SERVER_PONG_PACKET_TYPE = "example:pong";
const createExampleWelcomePacket = (payload) => {
    return {
        customPacketType: exports.EXAMPLE_SERVER_WELCOME_PACKET_TYPE,
        ...payload,
    };
};
exports.createExampleWelcomePacket = createExampleWelcomePacket;
const createExamplePongPacket = (payload) => {
    return {
        customPacketType: exports.EXAMPLE_SERVER_PONG_PACKET_TYPE,
        ...payload,
    };
};
exports.createExamplePongPacket = createExamplePongPacket;
const createExamplePingPacket = (payload) => {
    return {
        customPacketType: exports.EXAMPLE_CLIENT_PING_PACKET_TYPE,
        ...payload,
    };
};
exports.createExamplePingPacket = createExamplePingPacket;
