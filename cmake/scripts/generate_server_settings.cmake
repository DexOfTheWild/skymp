# Usage: "cmake -P generate_server_settings.cmake -DESM_PREFIX=<prefix_here> -DSERVER_SETTINGS_JSON_PATH=<path_to_server_settings.json> -DOFFLINE_MODE=<true_or_false>"

# read current server-settings.json
if(EXISTS "${SERVER_SETTINGS_JSON_PATH}")
    file(READ "${SERVER_SETTINGS_JSON_PATH}" SERVER_SETTINGS_JSON)
else()
    set(SERVER_SETTINGS_JSON "{}")
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "dataDir" "\"data\"")
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "name" "\"My Server\"")
    set(load_order Skyrim.esm Update.esm Dawnguard.esm HearthFires.esm Dragonborn.esm)
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "loadOrder" "[0,0,0,0,0]")
    foreach(index RANGE 0 4)
        list(GET load_order ${index} ESM)
        string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "loadOrder" ${index} "\"${ESM_PREFIX}${ESM}\"")
    endforeach()
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "npcEnabled" "false")
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "port" "7777")
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "maxPlayers" "100")
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "npcSettings" "{}")
endif()

if(OFFLINE_MODE)
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "offlineMode" "true")
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "master" "\"\"")
else()
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "offlineMode" "false")
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "master" "\"https://gateway.skymp.net\"")
endif()

<<<<<<< HEAD
=======
string(JSON CURRENT_GAMEMODE_PATH ERROR_VARIABLE CURRENT_GAMEMODE_PATH_ERROR GET "${SERVER_SETTINGS_JSON}" "gamemodePath")
if(CURRENT_GAMEMODE_PATH_ERROR)
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "gamemodePath" "\"./skymp5-gamemode/gamemode.js\"")
endif()

string(JSON CURRENT_PLUGINS ERROR_VARIABLE CURRENT_PLUGINS_ERROR GET "${SERVER_SETTINGS_JSON}" "plugins")
if(CURRENT_PLUGINS_ERROR)
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "plugins" "{}")
endif()

string(JSON CURRENT_PLUGIN_MODULES ERROR_VARIABLE CURRENT_PLUGIN_MODULES_ERROR GET "${SERVER_SETTINGS_JSON}" "pluginModules")
if(CURRENT_PLUGIN_MODULES_ERROR)
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "pluginModules" "{}")
endif()

string(JSON CURRENT_SERVER_PLUGIN_MODULES ERROR_VARIABLE CURRENT_SERVER_PLUGIN_MODULES_ERROR GET "${SERVER_SETTINGS_JSON}" "pluginModules" "server")
if(CURRENT_SERVER_PLUGIN_MODULES_ERROR)
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "pluginModules" "server" "[\"../voip/server/skymp5-voip-server-plugin.js\"]")
endif()

string(JSON CURRENT_VOIP_PLUGIN_CONFIG ERROR_VARIABLE CURRENT_VOIP_PLUGIN_CONFIG_ERROR GET "${SERVER_SETTINGS_JSON}" "plugins" "voip")
if(CURRENT_VOIP_PLUGIN_CONFIG_ERROR)
    string(JSON SERVER_SETTINGS_JSON SET "${SERVER_SETTINGS_JSON}" "plugins" "voip" "{ \"audioStateUpdateIntervalMs\": 100, \"defaultProximityRadius\": 2000, \"distanceAttenuationEnabled\": true, \"modeRadii\": { \"whisper\": 800, \"say\": 2000, \"yell\": 3000 } }")
endif()

>>>>>>> 8e7271ab ([skymp5-voip]: initial commit)
file(WRITE "${SERVER_SETTINGS_JSON_PATH}" "${SERVER_SETTINGS_JSON}")

if(SERVER_SETTINGS_BASE_JSON_PATH)
  file(WRITE "${SERVER_SETTINGS_BASE_JSON_PATH}" "${SERVER_SETTINGS_JSON}")
endif()
