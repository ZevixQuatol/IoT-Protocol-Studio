function(iotps_configure_core_target target)
  target_include_directories(
    ${target}
    PUBLIC
      $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
      $<INSTALL_INTERFACE:include>)
  target_compile_features(${target} PUBLIC cxx_std_20)
  iotps_enable_warnings(${target})
endfunction()

add_library(iotps_core_common INTERFACE)
add_library(iotps::common ALIAS iotps_core_common)
target_include_directories(
  iotps_core_common
  INTERFACE
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>)
target_compile_features(iotps_core_common INTERFACE cxx_std_20)

add_library(iotps_schema STATIC src/schema/schema.cpp)
add_library(iotps::schema ALIAS iotps_schema)
iotps_configure_core_target(iotps_schema)
target_link_libraries(iotps_schema PUBLIC iotps::common)

add_library(
  iotps_codec STATIC
  src/checksum.cpp
  src/codec/codec.cpp
  src/hex.cpp)
add_library(iotps::codec ALIAS iotps_codec)
iotps_configure_core_target(iotps_codec)
target_link_libraries(iotps_codec PUBLIC iotps::common iotps::schema)

add_library(iotps_transport STATIC src/transport/transport.cpp)
add_library(iotps::transport ALIAS iotps_transport)
iotps_configure_core_target(iotps_transport)
target_link_libraries(iotps_transport PUBLIC iotps::common)

add_library(iotps_simulator STATIC src/simulator/simulator.cpp)
add_library(iotps::simulator ALIAS iotps_simulator)
iotps_configure_core_target(iotps_simulator)
target_link_libraries(iotps_simulator PUBLIC iotps::codec iotps::transport)

add_library(iotps_testing STATIC src/testing/testing.cpp)
add_library(iotps::testing ALIAS iotps_testing)
iotps_configure_core_target(iotps_testing)
target_link_libraries(iotps_testing PUBLIC iotps::codec)

add_library(iotps_core STATIC src/engine.cpp)
add_library(iotps::core ALIAS iotps_core)
iotps_configure_core_target(iotps_core)
target_link_libraries(
  iotps_core
  PUBLIC
    iotps::common
    iotps::schema
    iotps::codec
    iotps::transport
    iotps::simulator
    iotps::testing)
