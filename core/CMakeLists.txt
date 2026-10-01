function(iotps_configure_core_target target)
  target_include_directories(
    ${target}
    PUBLIC
      $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
      $<INSTALL_INTERFACE:include>)
  target_compile_features(${target} PUBLIC cxx_std_20)
  iotps_enable_warnings(${target})
endfunction()

include(FetchContent)

set(RYML_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(RYML_DEFAULT_CALLBACK_USES_EXCEPTIONS ON CACHE BOOL "" FORCE)
set(RYML_INSTALL OFF CACHE BOOL "" FORCE)

FetchContent_Declare(
  rapidyaml
  URL https://codeload.github.com/biojppm/rapidyaml/tar.gz/refs/tags/v0.16.0
  URL_HASH SHA256=ad4337d468c5f5d8624651bdc2900f7fe601c83fc3cff669dc972bf8634af4e9
  DOWNLOAD_EXTRACT_TIMESTAMP FALSE)
FetchContent_MakeAvailable(rapidyaml)

if(MSVC)
  target_compile_options(ryml PRIVATE /utf-8)
endif()

add_library(iotps_core_common INTERFACE)
add_library(iotps::common ALIAS iotps_core_common)
target_include_directories(
  iotps_core_common
  INTERFACE
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>)
target_compile_features(iotps_core_common INTERFACE cxx_std_20)

add_library(iotps_schema STATIC src/schema/loader.cpp src/schema/schema.cpp)
add_library(iotps::schema ALIAS iotps_schema)
iotps_configure_core_target(iotps_schema)
target_link_libraries(iotps_schema PUBLIC iotps::common PRIVATE ryml::ryml)

add_library(iotps_workspace STATIC src/workspace/workspace.cpp)
add_library(iotps::workspace ALIAS iotps_workspace)
iotps_configure_core_target(iotps_workspace)
target_link_libraries(iotps_workspace PUBLIC iotps::schema PRIVATE ryml::ryml)

add_library(
  iotps_codec STATIC
  src/checksum.cpp
  src/debug.cpp
  src/codec/codec.cpp
  src/hex.cpp)
add_library(iotps::codec ALIAS iotps_codec)
iotps_configure_core_target(iotps_codec)
target_link_libraries(iotps_codec PUBLIC iotps::common iotps::schema)

add_library(iotps_transport STATIC src/transport/transport.cpp src/transport/framing.cpp
                                   src/transport/tcp.cpp)
add_library(iotps::transport ALIAS iotps_transport)
iotps_configure_core_target(iotps_transport)
target_link_libraries(iotps_transport PUBLIC iotps::common iotps::schema iotps::codec)
if(WIN32)
  target_link_libraries(iotps_transport PRIVATE ws2_32 iphlpapi)
endif()

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
    iotps::workspace
    iotps::codec
    iotps::transport
    iotps::simulator
    iotps::testing)
