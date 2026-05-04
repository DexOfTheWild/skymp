# Usage:
#   cmake -P generate_client_settings.cmake
#     -DCLIENT_SETTINGS_JSON_PATH=<path_to_client_settings.json>
#     -DVOIP_SETTINGS_JSON_PATH=<path_to_voip_settings.json>
#     -DOFFLINE_MODE=<true_or_false>

if(NOT DEFINED VOIP_SETTINGS_JSON_PATH OR "${VOIP_SETTINGS_JSON_PATH}" STREQUAL "")
    message(FATAL_ERROR "VOIP_SETTINGS_JSON_PATH is required")
endif()

# read current client settings json
if(EXISTS "${CLIENT_SETTINGS_JSON_PATH}")
    file(READ "${CLIENT_SETTINGS_JSON_PATH}" CLIENT_SETTINGS_JSON)
else()
    set(CLIENT_SETTINGS_JSON "{}")
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "server-ip" "\"127.0.0.1\"")
    string(JSON CLIENT_SETTINGS_JSON SET "${CLIENT_SETTINGS_JSON}" "server-port" "7777")
endif()

if(EXISTS "${VOIP_SETTINGS_JSON_PATH}")
    file(READ "${VOIP_SETTINGS_JSON_PATH}" VOIP_SETTINGS_JSON)
else()
    set(VOIP_SETTINGS_JSON "{}")
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

string(JSON CURRENT_VOIP_ENABLED ERROR_VARIABLE CURRENT_VOIP_ENABLED_ERROR GET "${VOIP_SETTINGS_JSON}" "enabled")
if(CURRENT_VOIP_ENABLED_ERROR)
    string(JSON LEGACY_VOIP_ENABLED ERROR_VARIABLE LEGACY_VOIP_ENABLED_ERROR GET "${CLIENT_SETTINGS_JSON}" "voip-enabled")
    if(LEGACY_VOIP_ENABLED_ERROR)
        string(JSON VOIP_SETTINGS_JSON SET "${VOIP_SETTINGS_JSON}" "enabled" "true")
    else()
        if(LEGACY_VOIP_ENABLED)
            string(JSON VOIP_SETTINGS_JSON SET "${VOIP_SETTINGS_JSON}" "enabled" "true")
        else()
            string(JSON VOIP_SETTINGS_JSON SET "${VOIP_SETTINGS_JSON}" "enabled" "false")
        endif()
    endif()
endif()

string(JSON CURRENT_VOIP_UI_URL ERROR_VARIABLE CURRENT_VOIP_UI_URL_ERROR GET "${VOIP_SETTINGS_JSON}" "uiUrl")
if(CURRENT_VOIP_UI_URL_ERROR)
    string(JSON LEGACY_VOIP_UI_URL ERROR_VARIABLE LEGACY_VOIP_UI_URL_ERROR GET "${CLIENT_SETTINGS_JSON}" "voip-ui-url")
    if(LEGACY_VOIP_UI_URL_ERROR)
        string(JSON VOIP_SETTINGS_JSON SET "${VOIP_SETTINGS_JSON}" "uiUrl" "\"https://${VOIP_DEFAULT_HOST}:3443/voip-test/\"")
    else()
        string(JSON VOIP_SETTINGS_JSON SET "${VOIP_SETTINGS_JSON}" "uiUrl" "\"${LEGACY_VOIP_UI_URL}\"")
    endif()
endif()

string(JSON CURRENT_VOIP_RAW_UI_URL ERROR_VARIABLE CURRENT_VOIP_RAW_UI_URL_ERROR GET "${VOIP_SETTINGS_JSON}" "rawUiUrl")
if(CURRENT_VOIP_RAW_UI_URL_ERROR)
    string(JSON LEGACY_VOIP_RAW_UI_URL ERROR_VARIABLE LEGACY_VOIP_RAW_UI_URL_ERROR GET "${CLIENT_SETTINGS_JSON}" "voip-raw-ui-url")
    if(LEGACY_VOIP_RAW_UI_URL_ERROR)
        string(JSON VOIP_SETTINGS_JSON SET "${VOIP_SETTINGS_JSON}" "rawUiUrl" "\"https://${VOIP_DEFAULT_HOST}:3443/voip-raw.html\"")
    else()
        string(JSON VOIP_SETTINGS_JSON SET "${VOIP_SETTINGS_JSON}" "rawUiUrl" "\"${LEGACY_VOIP_RAW_UI_URL}\"")
    endif()
endif()

string(JSON CURRENT_VOIP_PTT_KEY ERROR_VARIABLE CURRENT_VOIP_PTT_KEY_ERROR GET "${VOIP_SETTINGS_JSON}" "pttKey")
if(CURRENT_VOIP_PTT_KEY_ERROR)
    string(JSON LEGACY_VOIP_PTT_KEY ERROR_VARIABLE LEGACY_VOIP_PTT_KEY_ERROR GET "${CLIENT_SETTINGS_JSON}" "voip-ptt-key")
    if(LEGACY_VOIP_PTT_KEY_ERROR)
        string(JSON VOIP_SETTINGS_JSON SET "${VOIP_SETTINGS_JSON}" "pttKey" "\"V\"")
    else()
        string(JSON VOIP_SETTINGS_JSON SET "${VOIP_SETTINGS_JSON}" "pttKey" "\"${LEGACY_VOIP_PTT_KEY}\"")
    endif()
endif()

string(JSON CURRENT_POSITIONAL_AUDIO_MODE ERROR_VARIABLE CURRENT_POSITIONAL_AUDIO_MODE_ERROR GET "${VOIP_SETTINGS_JSON}" "positionalAudioMode")
if(CURRENT_POSITIONAL_AUDIO_MODE_ERROR)
    string(JSON VOIP_SETTINGS_JSON SET "${VOIP_SETTINGS_JSON}" "positionalAudioMode" "\"off\"")
endif()

foreach(legacy_key
    "voip-enabled"
    "voip-ui-url"
    "voip-raw-ui-url"
    "voip-ptt-key"
    "voip-proximity-radius"
    "voip-positional-audio-enabled"
)
    string(JSON CLIENT_SETTINGS_JSON ERROR_VARIABLE LEGACY_SETTING_REMOVE_ERROR REMOVE "${CLIENT_SETTINGS_JSON}" "${legacy_key}")
endforeach()

get_filename_component(VOIP_SETTINGS_DIR "${VOIP_SETTINGS_JSON_PATH}" DIRECTORY)
if(NOT EXISTS "${VOIP_SETTINGS_DIR}")
    file(MAKE_DIRECTORY "${VOIP_SETTINGS_DIR}")
endif()

file(WRITE "${CLIENT_SETTINGS_JSON_PATH}" "${CLIENT_SETTINGS_JSON}")
file(WRITE "${VOIP_SETTINGS_JSON_PATH}" "${VOIP_SETTINGS_JSON}")
