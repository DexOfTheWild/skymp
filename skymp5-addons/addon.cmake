function(skymp5_addon)
  cmake_parse_arguments(A "" "NAME;DIRECTORY;TARGET;OUTPUT_NAME" "" ${ARGN})
  foreach(arg NAME)
    if("${A_${arg}}" STREQUAL "")
      message(FATAL_ERROR "Missing ${arg} argument")
    endif()
  endforeach()

  if("${A_DIRECTORY}" STREQUAL "")
    set(A_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}")
  endif()

  if("${A_TARGET}" STREQUAL "")
    set(A_TARGET "skymp5-addon-${A_NAME}")
  endif()

  if("${A_OUTPUT_NAME}" STREQUAL "")
    set(A_OUTPUT_NAME "${A_NAME}.js")
  endif()

  file(GLOB_RECURSE addon_sources
    CONFIGURE_DEPENDS
    LIST_DIRECTORIES FALSE
    "${A_DIRECTORY}/*"
  )
  list(FILTER addon_sources EXCLUDE REGEX "[/\\\\](node_modules|build|dist)[/\\\\]")

  if(BUILD_CLIENT)
    include("${CMAKE_SOURCE_DIR}/cmake/yarn.cmake")

    yarn_execute_command(
      WORKING_DIRECTORY "${A_DIRECTORY}"
      COMMAND install
    )

    set(addon_out "${CMAKE_BINARY_DIR}/dist/client/Data/Platform/Plugins/${A_OUTPUT_NAME}")
    add_custom_command(
      OUTPUT "${addon_out}"
      COMMAND yarn --cwd "\"${A_DIRECTORY}\"" build
      DEPENDS ${addon_sources}
      COMMENT "Building skymp5 addon ${A_NAME}"
    )

    add_custom_target("${A_TARGET}"
      DEPENDS "${addon_out}"
      SOURCES ${addon_sources}
    )
  else()
    add_custom_target("${A_TARGET}"
      SOURCES ${addon_sources}
      COMMAND "${CMAKE_COMMAND}" -E echo "Building skymp5 addon ${A_NAME} is disabled. To enable it, set BUILD_CLIENT to ON."
    )
  endif()

  set_property(GLOBAL APPEND PROPERTY SKYMP5_ADDON_TARGETS "${A_TARGET}")
endfunction()
