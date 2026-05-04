cmake_minimum_required(VERSION 3.19)

project(nirnlab_runtime LANGUAGES NONE)

include(ExternalProject)

set(NIRNLAB_RUNTIME_GIT_REPOSITORY "https://github.com/DexOfTheWild/NirnLabUIPlatform.git"
    CACHE STRING "Pinned NirnLab UI Platform repository used for client runtime builds")
set(NIRNLAB_RUNTIME_GIT_TAG "voip-updates-0.1"
    CACHE STRING "Pinned NirnLab UI Platform commit used for client runtime builds")
option(USE_LOCAL_NIRNLAB_SOURCE "Prefer a local NirnLabUIPlatform checkout when available" ON)
set(NIRNLAB_SOURCE_DIR "" CACHE PATH "Optional path to a local NirnLabUIPlatform checkout")

if(NOT BUILD_NIRNLAB_RUNTIME)
  add_custom_target(nirnlab-runtime ALL
    COMMAND ${CMAKE_COMMAND} -E echo "nirnlab-runtime is disabled. Enable BUILD_NIRNLAB_RUNTIME to package the NirnLab client runtime."
  )
  return()
endif()

if(NOT WIN32)
  add_custom_target(nirnlab-runtime ALL
    COMMAND ${CMAKE_COMMAND} -E echo "nirnlab-runtime is only supported on Windows."
  )
  return()
endif()

if(NOT BUILD_CLIENT OR NOT BUILD_SKYRIM_PLATFORM)
  add_custom_target(nirnlab-runtime ALL
    COMMAND ${CMAKE_COMMAND} -E echo "nirnlab-runtime requires BUILD_CLIENT=ON and BUILD_SKYRIM_PLATFORM=ON."
  )
  return()
endif()

set(_nirnlab_local_source_dir "${NIRNLAB_SOURCE_DIR}")
if(_nirnlab_local_source_dir AND NOT IS_ABSOLUTE "${_nirnlab_local_source_dir}")
  get_filename_component(_nirnlab_local_source_dir "${_nirnlab_local_source_dir}" ABSOLUTE BASE_DIR "${CMAKE_SOURCE_DIR}")
endif()

set(_nirnlab_default_local_source_dir "${CMAKE_SOURCE_DIR}/NirnLabUIPlatform")
if(NOT _nirnlab_local_source_dir AND USE_LOCAL_NIRNLAB_SOURCE AND EXISTS "${_nirnlab_default_local_source_dir}/CMakeLists.txt")
  set(_nirnlab_local_source_dir "${_nirnlab_default_local_source_dir}")
endif()

if(_nirnlab_local_source_dir AND NOT EXISTS "${_nirnlab_local_source_dir}/CMakeLists.txt")
  message(FATAL_ERROR "NIRNLAB_SOURCE_DIR does not point to a NirnLabUIPlatform checkout: ${_nirnlab_local_source_dir}")
endif()

if(DEFINED CMAKE_TOOLCHAIN_FILE AND EXISTS "${CMAKE_TOOLCHAIN_FILE}")
  get_filename_component(_nirnlab_buildsystems_dir "${CMAKE_TOOLCHAIN_FILE}" DIRECTORY)
  get_filename_component(_nirnlab_scripts_dir "${_nirnlab_buildsystems_dir}" DIRECTORY)
  get_filename_component(_nirnlab_vcpkg_root "${_nirnlab_scripts_dir}" DIRECTORY)
elseif(DEFINED ENV{VCPKG_ROOT} AND EXISTS "$ENV{VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake")
  set(_nirnlab_vcpkg_root "$ENV{VCPKG_ROOT}")
else()
  set(_nirnlab_vcpkg_root "${CMAKE_SOURCE_DIR}/vcpkg")
endif()

if(NOT EXISTS "${_nirnlab_vcpkg_root}/scripts/buildsystems/vcpkg.cmake")
  message(FATAL_ERROR "Unable to determine VCPKG_ROOT for nirnlab-runtime: ${_nirnlab_vcpkg_root}")
endif()

set(_nirnlab_output_path "${CMAKE_BINARY_DIR}/dist/client")
set(_nirnlab_prefix "${CMAKE_BINARY_DIR}/nirnlab-runtime")
get_filename_component(_nirnlab_cmake_dir "${CMAKE_COMMAND}" DIRECTORY)
set(_nirnlab_script_dir "${CMAKE_CURRENT_LIST_DIR}/cmake")

set(_nirnlab_configure_command
  ${CMAKE_COMMAND}
  "-DHOST_CMAKE=${CMAKE_COMMAND}"
  "-DNIRNLAB_SOURCE_DIR=<SOURCE_DIR>"
  "-DNIRNLAB_BINARY_DIR=<BINARY_DIR>"
  "-DNIRNLAB_OUTPUT_PATH=${_nirnlab_output_path}"
  "-DNIRNLAB_VCPKG_ROOT=${_nirnlab_vcpkg_root}"
  "-DNIRNLAB_CMAKE_DIR=${_nirnlab_cmake_dir}"
  "-DNIRNLAB_GENERATOR=${CMAKE_GENERATOR}"
  "-DNIRNLAB_GENERATOR_PLATFORM=${CMAKE_GENERATOR_PLATFORM}"
  "-DNIRNLAB_GENERATOR_TOOLSET=${CMAKE_GENERATOR_TOOLSET}"
  -P "${_nirnlab_script_dir}/configure_external_nirnlab.cmake"
)

set(_nirnlab_build_command
  ${CMAKE_COMMAND}
  "-DHOST_CMAKE=${CMAKE_COMMAND}"
  "-DNIRNLAB_BUILD_DIR=<BINARY_DIR>"
  "-DNIRNLAB_BUILD_CONFIG=$<CONFIG>"
  "-DNIRNLAB_OUTPUT_PATH=${_nirnlab_output_path}"
  "-DNIRNLAB_VCPKG_ROOT=${_nirnlab_vcpkg_root}"
  "-DNIRNLAB_CMAKE_DIR=${_nirnlab_cmake_dir}"
  -P "${_nirnlab_script_dir}/build_external_nirnlab.cmake"
)

set(_nirnlab_runtime_byproducts
  "${_nirnlab_output_path}/Data/SKSE/Plugins/NirnLabUIPlugin.dll"
  "${_nirnlab_output_path}/Data/NirnLabUIPlatform/CEFSubprocess.exe"
  "${_nirnlab_output_path}/Data/NirnLabUIPlatform/libcef.dll"
)

if(_nirnlab_local_source_dir)
  message(STATUS "nirnlab-runtime: using local source checkout ${_nirnlab_local_source_dir}")
  ExternalProject_Add(nirnlab-runtime-external
    PREFIX "${_nirnlab_prefix}"
    SOURCE_DIR "${_nirnlab_local_source_dir}"
    DOWNLOAD_COMMAND ""
    UPDATE_COMMAND ""
    PATCH_COMMAND ""
    CONFIGURE_COMMAND ${_nirnlab_configure_command}
    BUILD_COMMAND ${_nirnlab_build_command}
    INSTALL_COMMAND ""
    BUILD_BYPRODUCTS ${_nirnlab_runtime_byproducts}
    USES_TERMINAL_CONFIGURE TRUE
    USES_TERMINAL_BUILD TRUE
  )
else()
  message(STATUS "nirnlab-runtime: fetching ${NIRNLAB_RUNTIME_GIT_REPOSITORY} @ ${NIRNLAB_RUNTIME_GIT_TAG}")
  ExternalProject_Add(nirnlab-runtime-external
    PREFIX "${_nirnlab_prefix}"
    GIT_REPOSITORY "${NIRNLAB_RUNTIME_GIT_REPOSITORY}"
    GIT_TAG "${NIRNLAB_RUNTIME_GIT_TAG}"
    GIT_PROGRESS TRUE
    GIT_SHALLOW FALSE
    UPDATE_DISCONNECTED TRUE
    CONFIGURE_COMMAND ${_nirnlab_configure_command}
    BUILD_COMMAND ${_nirnlab_build_command}
    INSTALL_COMMAND ""
    BUILD_BYPRODUCTS ${_nirnlab_runtime_byproducts}
    USES_TERMINAL_DOWNLOAD TRUE
    USES_TERMINAL_CONFIGURE TRUE
    USES_TERMINAL_BUILD TRUE
  )
endif()

add_custom_target(nirnlab-runtime ALL DEPENDS nirnlab-runtime-external)
