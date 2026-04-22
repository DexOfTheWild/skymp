# skymp5-voip

`skymp5-voip` is the first plugin built on top of the new SkyMP plugin host
surfaces. It exists both as a working VoIP implementation and as a concrete
example of how a client plugin, a server plugin, and a plugin-owned shared
protocol can fit together.

This file is intentionally README-style. It describes what the plugin can do,
how it is wired in, and what it still cannot do yet.

For generic platform rules, see:

- `docs/plugin_system_contract.md`

For the detailed LAN/dev setup flow, see:

- `docs/voip_phase1_lan.md`

## What It Currently Does

### Client side

- boots as a client plugin from `Data/Platform/Plugins/skymp5-voip.js`
- self-registers with the client plugin host
- loads the plugin-owned VoIP browser UI
- sends client config and PTT state through plugin-owned custom packets
- receives policy updates from the server plugin
- bridges browser log/media events back into Skyrim logs
- keeps plugin-owned browser event names and payloads in a shared protocol module

### Server side

- loads as a server plugin module via `pluginModules.server`
- tracks connected player voice identities
- computes proximity-based audible participant state
- sends policy updates back to each client through plugin-owned packets
- keeps its shared packet/state shapes in the plugin-owned shared module

### Shared/plugin-owned pieces

- packet types and browser event names in `shared/voipProtocol.ts`
- client-side policy coordination in `shared/voipClientPolicyController.ts`
- proximity math/state shaping in `shared/voipProximityEngine.ts`
- plugin-owned UI and local VoIP dev service under `ui/` and `ts/`

## How It Plugs Into SkyMP

### Client integration

Entry point:

- `client/index.ts`

Registration shape:

- calls `ensureClientPluginHostGlobal().registerClientPlugin("voip", init)`

The client plugin is still a normal Skyrim Platform JS bundle. The plugin host
provides the logical API surface, but SkyMP still controls how the plugin bundle
gets loaded.

### Server integration

Entry point:

- `server/index.ts`

Export shape:

- `createServerPlugin(api, config)`
- `pluginId = "voip"`

The server loader discovers this module from `settings.pluginModules.server`.

## Config And Usage

### Preferred client settings scope

The intended plugin-owned client settings scope is:

```json
{
  "skymp5-voip": {
    "enabled": true,
    "uiUrl": "https://your-main-pc-hostname:3443/voip-test/",
    "rawUiUrl": "https://your-main-pc-hostname:3443/voip-raw.html",
    "pttKey": "V"
  }
}
```

The client no longer configures proximity radius or positional audio. Effective
voice range comes from the server-side voice-mode radii, and positional audio is
always enabled.

### Transitional client compatibility

The current client plugin still contains a small compatibility helper that can
read legacy builtin-voip keys from `skymp5-client`. That fallback is
transitional and should eventually be removed after local setups migrate to the
plugin-owned settings scope.

### Server settings

Current server-side integration looks like:

```json
{
  "pluginModules": {
    "server": [
      "../voip/server/skymp5-voip-server-plugin.js"
    ]
  },
  "plugins": {
    "voip": {
      "defaultProximityRadius": 2000,
      "modeRadii": {
        "whisper": 800,
        "say": 2000,
        "yell": 3000
      }
    }
  }
}
```

Notes:

- `pluginModules.server` points at the server plugin module
- `plugins.voip` is the per-plugin config object passed into
  `createServerPlugin(api, config)`

## Build Outputs

From `skymp5-voip/scripts/build.js`, the plugin currently produces:

- client plugin bundle:
  - `build/dist/client/Data/Platform/Plugins/skymp5-voip.js`
- server plugin bundle:
  - `build/dist/voip/server/skymp5-voip-server-plugin.js`
- voip dev service bundle:
  - `build/dist/voip/voip-dev-server.js`
- plugin-owned browser UI:
  - `build/dist/voip/ui/*`

## Basic Build / Run Flow

```powershell
cd skymp5-voip
npm install
npm run build
npm run start
```

`npm run build` builds the:

- client plugin bundle
- server plugin bundle
- VoIP dev server bundle
- plugin-owned UI pages

`npm run start` runs the local VoIP dev service from:

- `build/dist/voip/voip-dev-server.js`

## Messaging Conventions Used By This Plugin

This plugin follows the namespacing rules captured in
`docs/plugin_system_contract.md`.

Examples:

- custom packets:
  - `voip:client-config`
  - `voip:policy-state`
- browser event names:
  - `skymp5-voip:command`
  - `skymp5-voip:page-loaded`
  - `skymp5-voip:page-log`
  - `skymp5-voip:page-error`
  - `skymp5-voip:page-media-state`
- DOM fallback attrs:
  - `data-skymp-voip-command-payload`
  - `data-skymp-voip-command-seq`

## What It Still Assumes About SkyMP

This plugin is more modular than the old builtin voip code, but it still assumes
some current SkyMP/runtime behavior:

- client host version `3` exposes `onLocalSpawn`, `onTick`,
  `getLocalProfileId`, `getSettingsScope`, `resolveScanCode`,
  `browser.getBackendName()`, and `browser.setMediaPermissionPolicy()`
- Skyrim Platform provides a persistent browser with the current
  focus/visibility/load semantics
- browser event bridging can use the current host-provided emit-event path or
  the current DOM fallback path
- custom packets are JSON payloads that carry a `customPacketType` field
- local identity/profile resolution still follows current auth/storage behavior
  behind `getLocalProfileId()`
- client bootstrap timing still depends on `onLocalSpawn`
- server identity registration still depends on `onSpawnAllowed`
- NirnLab detection still relies on current browser backend naming exposed by
  `browser.getBackendName()`

Those assumptions are acceptable for plugin `#1`, but they are not yet fully
abstracted platform guarantees.

## What It Does Not Do Yet

- it does not provide a generic client plugin discovery system
- it does not solve generic client plugin config for all plugins
- it does not provide plugin sandboxing or isolation guarantees
- it does not provide plugin dependency ordering
- it does not define a polished production permission UX across all browser
  backends
- it does not replace the need for plugin-specific setup docs
- it still carries migration compatibility for older builtin-voip settings

## Why This Matters For Plugin #2

`skymp5-voip` should be treated as:

- a real feature plugin
- the first end-to-end example of the host boundary
- not yet the final word on every plugin authoring rule

Another plugin should be able to copy the same broad shape:

1. own a stable `pluginId`
2. own its config scope
3. own its message names and packet types
4. own its shared protocol/constants
5. plug into the generic client/server host APIs

If a second plugin cannot do that cleanly, the missing piece should be pushed
back into the generic plugin system instead of copied as plugin-local voodoo.
