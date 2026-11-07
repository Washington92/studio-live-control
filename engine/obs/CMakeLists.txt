# WMix native libobs proof of concept.
# Supply an OBS Studio build/install with a libobs CMake package.
find_package(libobs CONFIG QUIET)
if(NOT libobs_FOUND)
  message(FATAL_ERROR "libobs CMake package not found. Configure with -Dlibobs_DIR=<path-to-libobs-cmake-config> or disable WMIX_WITH_LIBOBS.")
endif()
add_executable(wmix-obs-smoke src/obs_smoke.cpp)
if(TARGET OBS::libobs)
  target_link_libraries(wmix-obs-smoke PRIVATE OBS::libobs)
elseif(TARGET libobs)
  target_link_libraries(wmix-obs-smoke PRIVATE libobs)
else()
  message(FATAL_ERROR "libobs found, but no supported CMake target exported; inspect installed OBS CMake exports.")
endif()
