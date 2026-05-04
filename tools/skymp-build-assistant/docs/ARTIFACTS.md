# SkyMP build artifact inventory

This document maps **producers** (what builds each file) to **outputs** under `build/dist` and **Skyrim install paths** used by sync/install tooling. It is the human-readable companion to [manifest.default.yaml](../manifest.default.yaml).

## Layout rules

- CMake requires the binary directory to be `<repo>/build` (see root [CMakeLists.txt](../../CMakeLists.txt)).
- Most shipped layouts land under `build/dist/client` (game mirror) and `build/dist/server` (Node server).
- Addon-owned outputs are declared per addon in `skymp5-addons/*/skymp-addon.json`.

## Client (TypeScript plugin + settings)

| Artifact | Producer | Output path |
|----------|----------|-------------|
| `skymp5-client.js` | CMake target `skymp5-client` -> `yarn build` (webpack) | `build/dist/client/Data/Platform/Plugins/skymp5-client.js` |
| `skymp5-client-settings.txt` | CMake POST_BUILD script `generate_client_settings.cmake` | `build/dist/client/Data/Platform/Plugins/skymp5-client-settings.txt` |

Webpack config: [skymp5-client/webpack.config.js](../../skymp5-client/webpack.config.js). Optional `DEPLOY_PLUGIN=true` copies the plugin to `Data/Platform/PluginsDev` in the game folder.

## Front / in-game UI (React)

| Artifact | Producer | Output path |
|----------|----------|-------------|
| UI bundle(s) | Optional `BUILD_FRONT` -> `yarn build` (webpack) | `build/dist/client/Data/Platform/UI` (via [skymp5-front/config.js](../../skymp5-front/config.js)) |
| Platform distribution files | Skyrim Platform pack step | `build/dist/client/Data/Platform/Distribution` |
| Platform fonts | front/platform packaging | `build/dist/client/Data/Platform/Fonts` |
| Platform modules | Skyrim Platform packaging | `build/dist/client/Data/Platform/Modules` |

## Scripts

| Artifact | Producer | Output path |
|----------|----------|-------------|
| Papyrus scripts | Skyrim Platform / client packaging | `build/dist/client/Data/Scripts` |

## Server (Node)

| Artifact | Producer | Output path |
|----------|----------|-------------|
| Bundled server JS | CMake -> `yarn build-ts` (esbuild) | `build/dist/server/dist_back/skymp5-server.js` |
| Launch helpers / configs | CMake install / codegen | `build/dist/server/*` (e.g. `launch_server.bat`, settings - see server CMake) |

Package: [skymp5-server/package.json](../../skymp5-server/package.json).

## Addons

The build assistant no longer hardcodes addon outputs. Instead it discovers addon metadata from `skymp5-addons/*/skymp-addon.json`.

Each addon manifest can declare:

- `build`: how the assistant should build the addon (`cmake-target` or `command`)
- `artifacts`: source and destination mappings that join the normal sync/status flow
- `warnings` and `staleRemoval`: optional assistant-specific housekeeping rules

Current example:

| Addon | Producer | Output path |
|-------|----------|-------------|
| `auth-ui` client plugin | `skymp5-addons/auth-ui` webpack build via CMake target `skymp5-addon-auth-ui` | `build/dist/client/Data/Platform/Plugins/auth-ui.js` |
| `voip` client plugin + settings | `skymp5-addons/skymp5-voip` command build via `npm run build` | `skymp5-addons/build/dist/client/Data/Platform/Plugins/skymp5-voip.js` and `skymp5-addons/build/dist/client/Data/Platform/Plugins/skymp5-voip-settings.txt` |

## Gamemode (server)

| Artifact | Producer | Output path |
|----------|----------|-------------|
| `gamemode.js` | Default CMake local gamemode build (`BUILD_GAMEMODE=ON`, `BUILD_GAMEMODE_FROM_REMOTE=OFF`) copies `skymp5-gamemode/gamemode.js`; remote mode installs the built output from the separate repo | `build/dist/server/gamemode.js` |
| Nested gamemode entry | Default local CMake gamemode build copies the local `skymp5-gamemode/` folder into server dist | `build/dist/server/skymp5-gamemode/gamemode.js` |

Notes:

- Local gamemode is now the default build path.
- The nested `build/dist/server/skymp5-gamemode/` folder only exists for the local build path.
- Remote gamemode mode still exists behind `BUILD_GAMEMODE_FROM_REMOTE=ON` and `GITHUB_TOKEN`.

## Skyrim Platform native binaries

Built under CMake (Skyrim Platform). The `skyrim-platform` pack step writes the portable client layout into `build/dist/client`, and sync/install tooling should treat that dist tree as the source of truth for runtime files.

| Artifact | Output (dist mirror) | Game destination |
|----------|----------------------|------------------|
| `MpClientPlugin.dll` | `build/dist/client/Data/SKSE/Plugins/MpClientPlugin.dll` | `<SSE>/Data/SKSE/Plugins/MpClientPlugin.dll` |
| `SkyrimPlatform.dll` | `build/dist/client/Data/SKSE/Plugins/SkyrimPlatform.dll` | `<SSE>/Data/SKSE/Plugins/SkyrimPlatform.dll` |
| `SkyrimPlatform.ini` | `build/dist/client/Data/SKSE/Plugins/SkyrimPlatform.ini` | `<SSE>/Data/SKSE/Plugins/SkyrimPlatform.ini` |
| Runtime dependency directory | `build/dist/client/Data/Platform/Distribution/RuntimeDependencies/` | `<SSE>/Data/Platform/Distribution/RuntimeDependencies/` |

Typical runtime contents include `SkyrimPlatformImpl.dll`, `SkyrimPlatformCEF.exe.hidden`, `libcef.dll`, `libnode.dll`, `icudtl.dat`, `snapshot_blob.bin`, and related CEF/V8 DLLs.

Build bin dir for the native outputs is `build/skyrim-platform/_platform_se/bin/Release/` (or Debug), but the runtime directory copied into the game should come from `build/dist/client`, not a hand-curated subset of native binaries.

## NirnLab (optional sibling / in-repo checkout)

Paths are resolved like [sync-dev-runtime.ps1](../../sync-dev-runtime.ps1): sibling `../NirnLabUIPlatform` or in-repo `NirnLabUIPlatform`.

| Artifact | Typical source | Game / dist |
|----------|----------------|-------------|
| `NirnLabUIPlugin.dll` | `NirnLabUIPlatform/build/dist/Release/Data/SKSE/Plugins/...` | SKSE Plugins + dist/client mirror |
| NirnLab UI tree | `.../Data/NirnLabUIPlatform` | `<SSE>/Data/NirnLabUIPlatform` + dist |

## Sync / install mechanisms (existing)

1. **[sync-dev-runtime.ps1](../../sync-dev-runtime.ps1)** - SHA256 incremental sync; warns on `PluginsDev/skymp5-client.js`.
2. **CMake `INSTALL_CLIENT_DIST`** - `cmake -E copy_directory build/dist/client` -> `SKYRIM_DIR` (full tree copy; see root CMakeLists.txt).
3. **skyrim-platform/tools/dev_service** - packs platform into `build/dist/client` and may `copySync` to the game folder when configured.

The **SkyMP Build Assistant** (`skymp-dev`) unifies visibility and incremental sync using the same hash model as `sync-dev-runtime.ps1`, driven by [manifest.default.yaml](../manifest.default.yaml).
