add_library(iotps_core STATIC)
add_library(iotps::core ALIAS iotps_core)

target_sources(
  iotps_core
  PRIVATE
    src/checksum.cpp
    src/engine.cpp
    src/hex.cpp)

target_include_directories(
  iotps_core
  PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>)

target_compile_features(iotps_core PUBLIC cxx_std_20)
iotps_enable_warnings(iotps_core)

