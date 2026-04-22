# Pin the fork that contains microphone permission support until upstream catches up.
vcpkg_from_git(
  OUT_SOURCE_PATH SOURCE_PATH
  URL https://github.com/DexOfTheWild/NirnLabUIPlatform.git
  REF 1f5a70b7a3334d33a67a6f3bc2a9f4e24ae2db48
  FETCH_REF microphone-access
  HEAD_REF microphone-access
)

vcpkg_install_copyright(FILE_LIST "${SOURCE_PATH}/LICENSE")

file(COPY "${SOURCE_PATH}/src/UIPlatform/NirnLabUIPlatformAPI" DESTINATION "${CURRENT_PACKAGES_DIR}/include")

# When developing next to sibling checkout, overlay headers so Skyrim Platform can compile against unpushed API changes (e.g. Settings.h).
set(_nl_local_api "${CMAKE_CURRENT_LIST_DIR}/../../NirnLabUIPlatform/src/UIPlatform/NirnLabUIPlatformAPI")
if(EXISTS "${_nl_local_api}/Settings.h")
  message(STATUS "nirnlab-ui-platform-headers: overlay local NirnLabUIPlatformAPI from ${_nl_local_api}")
  file(COPY "${_nl_local_api}/." DESTINATION "${CURRENT_PACKAGES_DIR}/include/NirnLabUIPlatformAPI")
endif()
