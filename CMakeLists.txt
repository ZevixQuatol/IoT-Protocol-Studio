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

file(
  GLOB_RECURSE IOTPS_CXX_FORMAT_FILES
  CONFIGURE_DEPENDS
  "${CMAKE_SOURCE_DIR}/core/*.c"
  "${CMAKE_SOURCE_DIR}/core/*.cc"
  "${CMAKE_SOURCE_DIR}/core/*.cpp"
  "${CMAKE_SOURCE_DIR}/core/*.cxx"
  "${CMAKE_SOURCE_DIR}/core/*.h"
  "${CMAKE_SOURCE_DIR}/core/*.hh"
  "${CMAKE_SOURCE_DIR}/core/*.hpp"
  "${CMAKE_SOURCE_DIR}/core/*.hxx"
  "${CMAKE_SOURCE_DIR}/apps/*.c"
  "${CMAKE_SOURCE_DIR}/apps/*.cc"
  "${CMAKE_SOURCE_DIR}/apps/*.cpp"
  "${CMAKE_SOURCE_DIR}/apps/*.cxx"
  "${CMAKE_SOURCE_DIR}/apps/*.h"
  "${CMAKE_SOURCE_DIR}/apps/*.hh"
  "${CMAKE_SOURCE_DIR}/apps/*.hpp"
  "${CMAKE_SOURCE_DIR}/apps/*.hxx"
  "${CMAKE_SOURCE_DIR}/test/*.c"
  "${CMAKE_SOURCE_DIR}/test/*.cc"
  "${CMAKE_SOURCE_DIR}/test/*.cpp"
  "${CMAKE_SOURCE_DIR}/test/*.cxx"
  "${CMAKE_SOURCE_DIR}/test/*.h"
  "${CMAKE_SOURCE_DIR}/test/*.hh"
  "${CMAKE_SOURCE_DIR}/test/*.hpp"
  "${CMAKE_SOURCE_DIR}/test/*.hxx")
list(FILTER IOTPS_CXX_FORMAT_FILES EXCLUDE REGEX "/apps/web-ui/(node_modules|dist)/")

set(IOTPS_FORMAT_TARGETS)
set(IOTPS_FORMAT_CHECK_TARGETS)

find_program(IOTPS_CLANG_FORMAT_EXECUTABLE NAMES clang-format)
if(IOTPS_CLANG_FORMAT_EXECUTABLE)
  add_custom_target(
    format-cpp
    COMMAND "${IOTPS_CLANG_FORMAT_EXECUTABLE}" -i ${IOTPS_CXX_FORMAT_FILES}
    WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}"
    COMMENT "Formatting C/C++ sources"
    COMMAND_EXPAND_LISTS
    VERBATIM)
  add_custom_target(
    format-check-cpp
    COMMAND
      "${IOTPS_CLANG_FORMAT_EXECUTABLE}" --dry-run --Werror ${IOTPS_CXX_FORMAT_FILES}
    WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}"
    COMMENT "Checking C/C++ formatting"
    COMMAND_EXPAND_LISTS
    VERBATIM)
  list(APPEND IOTPS_FORMAT_TARGETS format-cpp)
  list(APPEND IOTPS_FORMAT_CHECK_TARGETS format-check-cpp)
else()
  add_custom_target(
    format-cpp
    COMMAND "${CMAKE_COMMAND}" -E echo "clang-format is required to format C/C++ sources"
    COMMAND "${CMAKE_COMMAND}" -E false
    VERBATIM)
  add_custom_target(
    format-check-cpp
    COMMAND "${CMAKE_COMMAND}" -E echo "clang-format is required to check C/C++ formatting"
    COMMAND "${CMAKE_COMMAND}" -E false
    VERBATIM)
  list(APPEND IOTPS_FORMAT_TARGETS format-cpp)
  list(APPEND IOTPS_FORMAT_CHECK_TARGETS format-check-cpp)
endif()

find_program(IOTPS_FORMAT_NPM_EXECUTABLE NAMES npm.cmd npm)
if(IOTPS_FORMAT_NPM_EXECUTABLE)
  add_custom_target(
    format-web
    COMMAND "${IOTPS_FORMAT_NPM_EXECUTABLE}" run format
    WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}/apps/web-ui"
    COMMENT "Formatting Web UI sources"
    VERBATIM)
  add_custom_target(
    format-check-web
    COMMAND "${IOTPS_FORMAT_NPM_EXECUTABLE}" run format:check
    WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}/apps/web-ui"
    COMMENT "Checking Web UI formatting"
    VERBATIM)
  list(APPEND IOTPS_FORMAT_TARGETS format-web)
  list(APPEND IOTPS_FORMAT_CHECK_TARGETS format-check-web)
else()
  add_custom_target(
    format-web
    COMMAND "${CMAKE_COMMAND}" -E echo "npm is required to format Web UI sources"
    COMMAND "${CMAKE_COMMAND}" -E false
    VERBATIM)
  add_custom_target(
    format-check-web
    COMMAND "${CMAKE_COMMAND}" -E echo "npm is required to check Web UI formatting"
    COMMAND "${CMAKE_COMMAND}" -E false
    VERBATIM)
  list(APPEND IOTPS_FORMAT_TARGETS format-web)
  list(APPEND IOTPS_FORMAT_CHECK_TARGETS format-check-web)
endif()

add_custom_target(format DEPENDS ${IOTPS_FORMAT_TARGETS})
add_custom_target(format-check DEPENDS ${IOTPS_FORMAT_CHECK_TARGETS})

include(CTest)

add_subdirectory(core)
add_subdirectory(apps)

if(BUILD_TESTING)
  add_subdirectory(test)
endif()
