cmake_minimum_required(VERSION 3.24)

project(
  IoTProtocolStudio
  VERSION 0.1.0
  DESCRIPTION "Binary device protocol development and testing workbench"
  LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/lib")
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/lib")

option(IOTPS_BUILD_CLI "Build the Core command-line client" ON)
option(IOTPS_BUILD_WEB_UI "Build the React web UI with the Windows client" ON)
option(IOTPS_BUILD_FUZZ "Build libFuzzer targets" OFF)

if(WIN32)
  option(IOTPS_BUILD_DESKTOP_WIN "Build the Windows x86_64 desktop client" ON)
else()
  option(IOTPS_BUILD_DESKTOP_WIN "Build the Windows x86_64 desktop client" OFF)
endif()

function(iotps_enable_warnings target)
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4 /permissive- /utf-8)
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic)
  endif()
endfunction()

include(CTest)

add_subdirectory(core)
add_subdirectory(apps)

if(BUILD_TESTING)
  add_subdirectory(test)
endif()

