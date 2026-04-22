if(NOT DEFINED HOST_CMAKE)
  message(FATAL_ERROR "HOST_CMAKE must be provided")
endif()
if(NOT DEFINED NIRNLAB_BUILD_DIR)
  message(FATAL_ERROR "NIRNLAB_BUILD_DIR must be provided")
endif()
if(NOT DEFINED NIRNLAB_BUILD_CONFIG)
  message(FATAL_ERROR "NIRNLAB_BUILD_CONFIG must be provided")
endif()
if(NOT DEFINED NIRNLAB_OUTPUT_PATH)
  message(FATAL_ERROR "NIRNLAB_OUTPUT_PATH must be provided")
endif()
if(NOT DEFINED NIRNLAB_VCPKG_ROOT)
  message(FATAL_ERROR "NIRNLAB_VCPKG_ROOT must be provided")
endif()

if(DEFINED NIRNLAB_CMAKE_DIR AND NOT NIRNLAB_CMAKE_DIR STREQUAL "")
  set(ENV{PATH} "${NIRNLAB_CMAKE_DIR};$ENV{PATH}")
endif()
set(ENV{VCPKG_ROOT} "${NIRNLAB_VCPKG_ROOT}")

set(_nirnlab_runtime_targets
  CefLibraryFiles
  CEFSubprocess
  NirnLabUIPlatform
  NirnLabUIPlugin
)

execute_process(
  COMMAND
    "${HOST_CMAKE}"
    --build "${NIRNLAB_BUILD_DIR}"
    --config "${NIRNLAB_BUILD_CONFIG}"
    --parallel
    --target ${_nirnlab_runtime_targets}
  RESULT_VARIABLE _result
  COMMAND_ECHO STDOUT
)

if(NOT _result EQUAL 0)
  message(FATAL_ERROR "Failed to build NirnLab external build (exit code ${_result})")
endif()

file(REMOVE
  "${NIRNLAB_OUTPUT_PATH}/Data/SKSE/Plugins/NirnLabUIPlatformTest.dll"
  "${NIRNLAB_OUTPUT_PATH}/Data/SKSE/Plugins/NirnLabUIPlatformTest.pdb"
)
