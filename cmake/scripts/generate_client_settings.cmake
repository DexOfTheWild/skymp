# Usage: "cmake -P generate_client_settings.cmake -DCLIENT_SETTINGS_JSON_PATH=<path_to_client_settings.json> -DOFFLINE_MODE=<true_or_false>"

# read current server-settings.json
if(EXISTS "${CLIENT_SETTINGS_JSON_PATH}")
    file(READ "${CLIENT_SETTINGS_JSON_PATH}" CLIENT_SETTINGS_JSON)
else()
    set(CLIENT_SETTINGS_JSON "{}")
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "server-ip" "\"127.0.0.1\"")
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "server-port" "7777")
endif()

if(OFFLINE_MODE)
    set(profile_id "")
    string(JSON profile_id ERROR_VARIABLE dummy GET "${CLIENT_SETTINGS_JSON}" "gameData" "profileId")

    # check if profile_id is number
    if(NOT profile_id MATCHES "^[0-9]+$")
        set(profile_id 1)
    endif()
    
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "gameData" "{ \"profileId\": ${profile_id} }")
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "master" "\"\"")
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "server-master-key" "null")
else()
    string(JSON CLIENT_SETTINGS_JSON REMOVE "${CLIENT_SETTINGS_JSON}" "gameData")
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "master" "\"https://gateway.skymp.net\"")

    # if ip in config is 127.0.0.1
    string(JSON server_ip ERROR_VARIABLE dummy GET "${CLIENT_SETTINGS_JSON}" "server-ip")
    if(server_ip STREQUAL "127.0.0.1")
        file(DOWNLOAD "https://api.ipify.org" "${CMAKE_CURRENT_BINARY_DIR}/ip.txt")
        file(READ "${CMAKE_CURRENT_BINARY_DIR}/ip.txt" ip)
        set(port 7777)
        string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "server-master-key" "\"${ip}:${port}\"")
    else()
        string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "server-master-key" "null")
    endif()
endif()

set(VOIP_DEFAULT_HOST "localhost")
if(NOT "$ENV{COMPUTERNAME}" STREQUAL "")
    set(VOIP_DEFAULT_HOST "$ENV{COMPUTERNAME}")
endif()

string(JSON CURRENT_VOIP_ENABLED ERROR_VARIABLE CURRENT_VOIP_ENABLED_ERROR GET "${CLIENT_SETTINGS_JSON}" "voip-enabled")
if(CURRENT_VOIP_ENABLED_ERROR)
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "voip-enabled" "true")
endif()

string(JSON CURRENT_VOIP_UI_URL ERROR_VARIABLE CURRENT_VOIP_UI_URL_ERROR GET "${CLIENT_SETTINGS_JSON}" "voip-ui-url")
if(CURRENT_VOIP_UI_URL_ERROR)
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "voip-ui-url" "\"https://${VOIP_DEFAULT_HOST}:3443/voip-test/\"")
endif()

string(JSON CURRENT_VOIP_RAW_UI_URL ERROR_VARIABLE CURRENT_VOIP_RAW_UI_URL_ERROR GET "${CLIENT_SETTINGS_JSON}" "voip-raw-ui-url")
if(CURRENT_VOIP_RAW_UI_URL_ERROR)
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "voip-raw-ui-url" "\"https://${VOIP_DEFAULT_HOST}:3443/voip-raw.html\"")
endif()

string(JSON CURRENT_VOIP_PTT_KEY ERROR_VARIABLE CURRENT_VOIP_PTT_KEY_ERROR GET "${CLIENT_SETTINGS_JSON}" "voip-ptt-key")
if(CURRENT_VOIP_PTT_KEY_ERROR)
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "voip-ptt-key" "\"V\"")
endif()

string(JSON LEGACY_VOIP_RADIUS ERROR_VARIABLE LEGACY_VOIP_RADIUS_ERROR GET "${CLIENT_SETTINGS_JSON}" "voip-proximity-radius")
if(NOT LEGACY_VOIP_RADIUS_ERROR)
    string(JSON CLIENT_SETTINGS_JSON REMOVE "${CLIENT_SETTINGS_JSON}" "voip-proximity-radius")
endif()

string(JSON LEGACY_VOIP_POSITIONAL_AUDIO ERROR_VARIABLE LEGACY_VOIP_POSITIONAL_AUDIO_ERROR GET "${CLIENT_SETTINGS_JSON}" "voip-positional-audio-enabled")
if(NOT LEGACY_VOIP_POSITIONAL_AUDIO_ERROR)
    string(JSON CLIENT_SETTINGS_JSON REMOVE "${CLIENT_SETTINGS_JSON}" "voip-positional-audio-enabled")
endif()

file(WRITE "${CLIENT_SETTINGS_JSON_PATH}" "${CLIENT_SETTINGS_JSON}")
