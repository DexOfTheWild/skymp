project(skymp5-addons)

set_property(GLOBAL PROPERTY SKYMP5_ADDON_TARGETS "")
add_custom_target(skymp5-addons ALL)

file(GLOB addon_dirs RELATIVE "${CMAKE_CURRENT_LIST_DIR}" "${CMAKE_CURRENT_LIST_DIR}/*")
foreach(addon_dir ${addon_dirs})
  set(addon_path "${CMAKE_CURRENT_LIST_DIR}/${addon_dir}")

  if(NOT IS_DIRECTORY "${addon_path}")
    continue()
  endif()

  if(addon_dir STREQUAL "build" OR addon_dir MATCHES "^\\.")
    continue()
  endif()

  if(EXISTS "${addon_path}/CMakeLists.txt")
    add_subdirectory("${addon_dir}")
  endif()
endforeach()

get_property(skymp5_addon_targets GLOBAL PROPERTY SKYMP5_ADDON_TARGETS)
if(skymp5_addon_targets)
  add_dependencies(skymp5-addons ${skymp5_addon_targets})
endif()
