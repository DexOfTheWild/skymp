# SkyMP Example Plugin

This package is a small reference plugin for the core plugin host. It is kept
disabled by default and exists for three purposes:

- show the intended client entry shape
- show the intended server module shape
- give the repo a real consumer for smoke checks before larger plugins rebase

## What It Demonstrates

- client self-registration through `ensureClientPluginHostGlobal()`
- `onLocalSpawn(...)`
- `registerConsoleCommand(...)`
- `browser.emitEvent(...)`
- capability checks through `api.capabilities`
- server `createServerPlugin(api, config)`
- server `onSpawnAllowed(...)`
- server `onCustomPacket(type, handler)`

## Build

```powershell
cd skymp5-example-plugin
npm run build
```

The build emits CommonJS files into `skymp5-example-plugin/dist/`.

## Manual Enable

This plugin is not enabled by generated default settings.

To enable the server side manually, point `settings.pluginModules.server` at the
built server module:

```json
{
  "pluginModules": {
    "server": [
      "../skymp5-example-plugin/dist/server/index.js"
    ]
  },
  "plugins": {
    "example": {
      "greeting": "Hello from settings"
    }
  }
}
```

To enable the client side manually, compile the client entry and place the built
plugin output where Skyrim Platform loads plugins from, such as
`Data/Platform/PluginsDev`.

This package is intended as a reference consumer for the host contract, not as
production plugin scaffolding.
