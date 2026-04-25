"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setClientPluginBrowserVisibilitySuppressed = exports.isClientPluginBrowserVisibilitySuppressed = void 0;
const ensureClientPluginBrowserVisibilityState = () => {
    if (!globalThis.__skympClientPluginBrowserVisibilityState) {
        globalThis.__skympClientPluginBrowserVisibilityState = {
            suppressedOwners: {},
        };
    }
    return globalThis.__skympClientPluginBrowserVisibilityState;
};
const normalizeOwnerId = (ownerId) => ownerId.trim().toLowerCase();
const isClientPluginBrowserVisibilitySuppressed = () => {
    const state = ensureClientPluginBrowserVisibilityState();
    return Object.keys(state.suppressedOwners).length > 0;
};
exports.isClientPluginBrowserVisibilitySuppressed = isClientPluginBrowserVisibilitySuppressed;
const setClientPluginBrowserVisibilitySuppressed = (ownerId, suppressed) => {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    if (!normalizedOwnerId) {
        return (0, exports.isClientPluginBrowserVisibilitySuppressed)();
    }
    const state = ensureClientPluginBrowserVisibilityState();
    if (suppressed) {
        state.suppressedOwners[normalizedOwnerId] = true;
    }
    else {
        delete state.suppressedOwners[normalizedOwnerId];
    }
    return (0, exports.isClientPluginBrowserVisibilitySuppressed)();
};
exports.setClientPluginBrowserVisibilitySuppressed = setClientPluginBrowserVisibilitySuppressed;
