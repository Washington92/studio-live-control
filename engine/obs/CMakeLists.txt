# WMix native libobs engine. Prefer linking directly inside the OBS Studio
# source build; permit matching installed CMake exports for external builds.
if(NOT TARGET OBS::libobs AND NOT TARGET libobs)
  find_package(libobs CONFIG REQUIRED)
endif()
add_executable(wmix-obs-smoke src/obs_smoke.cpp)
if(TARGET OBS::libobs)
  target_link_libraries(wmix-obs-smoke PRIVATE OBS::libobs)
elseif(TARGET libobs)
  target_link_libraries(wmix-obs-smoke PRIVATE libobs)
else()
  message(FATAL_ERROR "libobs target missing (OBS::libobs or libobs)")
endif()

add_test(NAME wmix_obs_startup COMMAND wmix-obs-smoke)
add_test(NAME wmix_obs_av COMMAND wmix-obs-smoke --av)
add_test(NAME wmix_obs_dual_scene COMMAND wmix-obs-smoke --dual)

add_test(NAME wmix_obs_cut COMMAND wmix-obs-smoke --switch)

# Requires the OBS color-source plugin to be discoverable at runtime.
add_test(NAME wmix_obs_test_source COMMAND wmix-obs-smoke --sources)

# End-to-end native control protocol test; requires OBS plugins and GPU.
add_test(NAME wmix_obs_control_protocol
  COMMAND ${CMAKE_COMMAND}
    "-DWMIX_EXECUTABLE=$<TARGET_FILE:wmix-obs-smoke>"
    "-DWMIX_COMMANDS=${CMAKE_CURRENT_SOURCE_DIR}/tests/control_commands.txt"
    -P "${CMAKE_CURRENT_SOURCE_DIR}/tests/control_protocol.cmake")
set_tests_properties(wmix_obs_control_protocol PROPERTIES TIMEOUT 30)
