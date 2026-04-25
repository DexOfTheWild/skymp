# SkyMP Plugin System Contract

This file captures the current plugin contract while the design is still fresh.
It is intentionally small and practical. The goal is to make it clear what is
currently treated as public API, what is still transitional, and what a second
plugin author would need to follow.

## Status

- Current API version: client `4`, server `2`
- Public API entry points live in:
  - `skymp5-plugin-api/clientPluginHost.ts`
  - `skymp5-plugin-api/serverPluginHost.ts`
- Current host/loader implementations live in:
  - `skymp5-client/src/services/services/clientPluginHostService.ts`
  - `skymp5-server/ts/plugins/serverPluginLoader.ts`
- Reference example plugin lives in:
  - `skymp5-example-plugin/`
Treat the `skymp5-plugin-api` package as the stable surface first. Treat the
host/loader implementation details as internal unless they are promoted here.

## Client Plugin Contract

Client plugins currently self-register into a global host. A plugin bundle calls
`ensureClientPluginHostGlobal().registerClientPlugin(pluginId, init)`, and the
host will either register immediately or queue the registration until the
runtime host is active.

### Registration rules

- `pluginId` must be unique per client runtime.
- Empty plugin IDs are rejected.
- Registration order is not guaranteed to be meaningful.

### Client API methods

Exposed by `ClientPluginApi` in `skymp5-plugin-api/clientPluginHost.ts`:

- `capabilities`
- `browser.emitEvent(eventName, dataJson)`
- `browser.getBackendName()`
- `browser.isFocused()`
- `browser.isVisible()`
- `browser.loadUrl(url)`
- `browser.setMediaPermissionPolicy(policy)`
- `browser.setFocused(focused)`
- `browser.setVisible(visible)`
- `getLocalProfileId()`
- `getSettingsScope(scope)`
- `log(...args)`
- `logError(...args)`
- `registerConsoleCommand(commandName, handler)`
- `resolveScanCode(keyName)`
- `sendCustomPacket(type, payload, reliability?)`

### Client API subscriptions

- `onBrowserMessage(key, handler)`
- `onCustomPacket(type, handler)`
- `onInputState(handler)`
- `onLocalSpawn(handler)`
- `onTick(handler)`

All subscription methods return an unsubscribe function.

### Current client caveats

- Client plugins are still normal JS bundles loaded by Skyrim Platform; there is
  not yet a generic client-side discovery/manifest system.
- The browser API is a stable logical surface, but the current host still relies
  on Skyrim Platform browser behavior and a DOM/custom-event fallback.
- Media-permission policy control is advertised through
  `capabilities.browser.mediaPermissionPolicies`. Plugins should check
  capabilities instead of duck-typing browser methods.
- Plugin-defined local console commands currently register as `mp`
  subcommands and dispatch as `mp <commandName> ...`; there is not yet a
  generic runtime facility for minting brand-new top-level console commands.

## Server Plugin Contract

Server plugins are config-driven modules loaded from
`settings.pluginModules.server`. Each module exports:

- `createServerPlugin(api, config)`
- optional `pluginId`

If `pluginId` is omitted, the loader derives one from the module filename.

### Server API methods

Exposed by `ServerPluginApi` in `skymp5-plugin-api/serverPluginHost.ts`:

- `capabilities`
- `error(...args)`
- `getActorAngleZ(actorId)`
- `getActorCellOrWorld(actorId)`
- `getActorPos(actorId)`
- `getConfig<T>()`
- `getUserActor(userId)`
- `isConnected(userId)`
- `log(...args)`
- `onCustomPacket(type, handler)`
- `onSpawnAllowed(handler)`
- `sendCustomPacket(userId, payload)`
- `pluginId`
- `version`

### Server plugin hooks

Plugins may implement:

- `init()`
- `connect(userId)`
- `customPacket(userId, type, content)`
- `disconnect(userId)`
- `dispose()`
- `update()`
- `systemName`

The loader wraps these hooks into the normal server `System` lifecycle and logs
plugin failures without crashing the whole server process by default.
`onCustomPacket(type, handler)` is the preferred higher-level packet API for new
plugins. `customPacket(userId, type, content)` remains supported as the
lower-level legacy-compatible hook.

## Config Entry Points

### Generic server config

Current generic server-side plugin settings:

- `pluginModules.server`
  - array of module paths to load
- `plugins.<pluginId>`
  - per-plugin config object passed to `createServerPlugin(api, config)`

### Client config

There is not yet a generic client plugin config registry. The current
expectation is that each client plugin owns its own top-level settings scope,
typically something like `sp.settings["skymp5-<pluginId>"]`, and reads it
through `ClientPluginApi.getSettingsScope(scope)`.

If a plugin needs migration compatibility with older settings keys, keep that
compatibility in a plugin-local helper and document it in the plugin's own
README. Do not treat migration shims as part of the generic core contract.

## Messaging And Namespacing Conventions

Plugin authors must namespace any cross-boundary messages so different plugins
do not collide.

### Custom packets

- Reserve `customPacketType` values per plugin.
- Recommended pattern: `<pluginId>:<messageName>`
- Keep packet parsing/creation in a shared plugin-owned protocol module.
- Example pattern:
  - `inventory-sync:state`
  - `weather-tools:request`

### Browser event names

- Namespace browser event names per plugin.
- Recommended pattern: `skymp5-<pluginId>:<eventName>`
- Example pattern:
  - `skymp5-inventory-sync:ready`
  - `skymp5-weather-tools:refresh`

### DOM fallback attributes

- If a plugin needs DOM attribute fallbacks, namespace them too.
- Recommended pattern: `data-skymp-<pluginId>-...`
- Example pattern:
  - `data-skymp-inventory-sync-command-payload`
  - `data-skymp-inventory-sync-command-seq`

### Shared protocol ownership

- Shared constants and payload shapes should live with the plugin, not in core,
  unless they become cross-plugin platform primitives.
- Concrete plugin-local naming examples should live with the plugin itself.

## Plugin #2 Checklist

Another plugin author should be able to build plugin `#2` by following this
shape:

1. Pick a stable `pluginId`.
2. Define plugin-owned message names and packet types with that namespace.
3. Put cross-runtime payload types in a plugin-owned shared module.
4. Create a client entry bundle that self-registers with the client host.
5. Create a server entry module that exports `createServerPlugin(api, config)`.
6. Keep plugin config under `plugins.<pluginId>` on the server and under
   a plugin-owned client scope such as `sp.settings["skymp5-<pluginId>"]`.
7. Document any runtime assumptions that are not covered by the public host API.
8. Start from `skymp5-example-plugin/` if you want a small in-tree reference.

## Example Plugin

`skymp5-example-plugin/` is a disabled reference consumer for the plugin host.
It demonstrates the intended client and server module shapes without enabling
the plugin in generated defaults.

To enable it manually:

1. Build the package with `npm run build` inside `skymp5-example-plugin/`.
2. Point `settings.pluginModules.server` at
   `../skymp5-example-plugin/dist/server/index.js`.
3. Put the built client output under your Skyrim Platform plugins directory.

## Not Yet Formalized

The following are intentionally not promised as stable platform behavior yet:

- plugin load ordering guarantees
- client plugin auto-discovery conventions
- generic client plugin config schema
- plugin dependency ordering between plugins
- plugin sandboxing or isolation guarantees
