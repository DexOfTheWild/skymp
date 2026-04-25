"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateClientPluginHostGlobal = exports.ensureClientPluginHostGlobal = exports.SKYMP_CLIENT_PLUGIN_HOST_VERSION = exports.SKYMP_CLIENT_PLUGIN_HOST_NAME = void 0;
exports.SKYMP_CLIENT_PLUGIN_HOST_NAME = "__skympClientPluginHost";
exports.SKYMP_CLIENT_PLUGIN_HOST_VERSION = 4;
const ensureClientPluginHostGlobal = () => {
    if (!globalThis.__skympClientPluginHost) {
        globalThis.__skympClientPluginHost = {
            __pendingRegistrations: [],
            __runtimeRegistrar: null,
            registerClientPlugin: (pluginId, init) => {
                const host = ensureClientPluginHostGlobalInternal();
                if (host.__runtimeRegistrar) {
                    host.__runtimeRegistrar(pluginId, init);
                    return;
                }
                host.__pendingRegistrations.push({ init, pluginId });
            },
            version: null,
        };
    }
    return globalThis.__skympClientPluginHost;
};
exports.ensureClientPluginHostGlobal = ensureClientPluginHostGlobal;
const activateClientPluginHostGlobal = (runtimeRegistrar) => {
    const host = ensureClientPluginHostGlobalInternal();
    host.__runtimeRegistrar = runtimeRegistrar;
    host.version = exports.SKYMP_CLIENT_PLUGIN_HOST_VERSION;
    const pending = host.__pendingRegistrations.splice(0);
    for (const registration of pending) {
        runtimeRegistrar(registration.pluginId, registration.init);
    }
    return host;
};
exports.activateClientPluginHostGlobal = activateClientPluginHostGlobal;
const ensureClientPluginHostGlobalInternal = () => {
    return (0, exports.ensureClientPluginHostGlobal)();
};
