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

- loads as a server addon module via `addonModules.server`
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

- calls `ensureClientAddonHostGlobal().registerClientAddon("voip", init)`

The client addon is still a normal Skyrim Platform JS bundle. The addon host
provides the logical API surface, but SkyMP still controls how the addon bundle
gets loaded.

### Server integration

Entry point:

- `server/index.ts`

Export shape:

- `createServerAddon(api, config)`
- `addonId = "voip"`

The server loader discovers this module from `settings.addonModules.server`.

## Config And Usage

### Preferred client settings scope

The intended plugin-owned client settings scope is:

```json
{
  "enabled": true,
  "uiUrl": "https://your-main-pc-hostname:3443/voip-test/",
  "rawUiUrl": "https://your-main-pc-hostname:3443/voip-raw.html",
  "positionalAudioMode": "stereo",
  "pttKey": "V"
}
```

This JSON lives in `Data/Platform/Plugins/skymp5-voip-settings.txt`.

The client no longer configures proximity radius. Effective voice range comes
from the server-side voice-mode radii. Positional audio is now a plugin-owned
browser playback setting:

- `positionalAudioMode: "off"` is the default
- `positionalAudioMode: "stereo"` enables browser-side left/right spatial audio

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

- `addonModules.server` points at the server addon module
- `addons.voip` is the per-addon config object passed into
  `createServerAddon(api, config)`

### Hosting your own VoIP service

`skymp5-voip` should be thought of as three separate pieces:

- the SkyMP client plugin
- the SkyMP server plugin
- the browser/UI + LiveKit deployment used for media transport

The SkyMP plugins do not require the bundled local dev server specifically.
That bundled service is only the current development convenience path. A server
owner can host their own VoIP stack as long as the client can load the VoIP UI
over HTTPS and that UI can obtain a valid LiveKit token.

The intended production-oriented setup paths are:

- self-hosted LiveKit:
  - run LiveKit on your own server or VM
  - host the VoIP UI on your own HTTPS origin
  - provide your own token-issuing backend
- LiveKit Cloud:
  - create a LiveKit Cloud project
  - host the VoIP UI on your own HTTPS origin
  - provide your own token-issuing backend that issues tokens for that project

At a high level, a production deployment should provide:

- a public HTTPS URL for `uiUrl`
- a public HTTPS URL for `rawUiUrl`
- a token endpoint reachable by the VoIP UI
- a LiveKit deployment reachable by that UI

The exact token issuance/auth strategy is intentionally left up to the SkyMP
server owner for now. In practice, production deployments should treat token
generation as backend-owned infrastructure, not as a public anonymous
`identity -> token` endpoint.

For self-hosted TURN validation, the browser pages support an optional query
override:

- `?iceTransportPolicy=relay`

That forces relay-only ICE on the page so operators can verify TURN/TLS
fallback with a real browser session against their deployment.

For now, the plugin-owned client settings shape is:

```json
{
  "enabled": true,
  "uiUrl": "https://voice.example.com/voip-test/",
  "rawUiUrl": "https://voice.example.com/voip-raw.html",
  "positionalAudioMode": "stereo",
  "pttKey": "V"
}
```

That means a server owner should be able to swap between:

- local/dev hosting
- self-hosted LiveKit
- LiveKit Cloud

without changing the in-game plugin model, only the hosted VoIP infrastructure
behind those URLs.

## Rendering Strategy Notes

`skymp5-voip` should try to stay agnostic about how SkyMP renders front-end UI.
The plugin assumes there is some browser-capable host for the VoIP page, but it
does not require one specific app framework.

The reusable pieces live in:

- `shared/voipProtocol.ts`
- `shared/voipClientPolicyController.ts`
- `ui/src/voipHarness.ts`
- `ui/src/voipPageBridge.ts`

Those pieces are intended to work whether a project renders VoIP using:

- direct top-level browser navigation to the VoIP page
- a persistent fullscreen shell that embeds the VoIP page as a module
- a small debug/test surface that mounts the VoIP page separately

### Recommended host patterns

#### 1. Direct page takeover

This is the simplest path and is still useful for bring-up:

- load `uiUrl` or `rawUiUrl` directly into the browser host
- forward `skymp5-voip:command` into the page
- relay `skymp5-voip:page-*` messages back to the plugin host

This keeps the VoIP page fully self-contained, but it can be awkward if your
project also uses the same browser surface for auth, menus, HUD, or overlays.

#### 2. Embedded module inside a shell

This is the recommended long-term path for projects with a persistent browser
shell:

- keep one top-level shell page loaded
- mount the remote VoIP page inside an iframe or similar isolated region
- treat VoIP as a hosted module, not as owner of the whole browser surface

For an embedded VoIP page:

- append `?skympVoipHostBridge=1` to the VoIP page URL
- allow `microphone; autoplay` on the iframe
- send host state with `skymp5-voip:set-host-state`
- send normal VoIP commands with `skymp5-voip:command`
- receive `skymp5-voip:page-loaded`, `page-log`, `page-error`, and
  `page-media-state` back from the page

The current `skymp5-front` shell is a reference adapter for this pattern, not a
hard requirement for all SkyMP projects.

#### 3. Standalone diagnostics pages

`voip-test` and `voip-raw` are meant to stay useful outside the in-game shell:

- use `voip-test` for the normal HUD/debug experience
- use `voip-raw` for low-level TURN/PTT/media debugging

These pages are the easiest way to validate a backend without depending on a
particular game-menu rendering setup.

### Minimum host contract

If a project wants to host `skymp5-voip` in its own UI stack, the minimum
contract is:

1. Provide a secure-origin VoIP page reachable by `uiUrl` / `rawUiUrl`.
2. Deliver plugin commands to that page.
3. Return page telemetry/log/media events back to the client plugin host.
4. Decide locally how VoIP visibility/focus should map onto the rest of the UI.

In other words: the SkyMP project should own the rendering strategy, while
`skymp5-voip` owns the VoIP protocol, media behavior, and reference page.

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
  - `skymp5-voip:set-host-state`
  - `skymp5-voip:page-loaded`
  - `skymp5-voip:page-log`
  - `skymp5-voip:page-error`
  - `skymp5-voip:page-media-state`
- DOM fallback attrs:
  - `data-skymp-voip-command-payload`
  - `data-skymp-voip-command-seq`
- embedded-host bridge query params:
  - `skympVoipHostBridge=1`
  - legacy compatibility: `skympShellBridge=1`

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
- not yet the final word on every addon authoring rule

Another addon should be able to copy the same broad shape:

1. own a stable `addonId`
2. own its config scope
3. own its message names and packet types
4. own its shared protocol/constants
5. plug into the generic client/server host APIs

If a second plugin cannot do that cleanly, the missing piece should be pushed
back into the generic plugin system instead of copied as plugin-local voodoo.
