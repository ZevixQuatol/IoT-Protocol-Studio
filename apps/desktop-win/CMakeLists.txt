include(FetchContent)

set(WEBVIEW_BUILD_DOCS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_SHARED_LIBRARY OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_STATIC_LIBRARY OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_ENABLE_CHECKS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_ENABLE_PACKAGING OFF CACHE BOOL "" FORCE)
set(WEBVIEW_INSTALL_DOCS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_INSTALL_TARGETS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_USE_BUILTIN_MSWEBVIEW2 ON CACHE BOOL "" FORCE)

FetchContent_Declare(
  webview
  GIT_REPOSITORY https://github.com/webview/webview.git
  GIT_TAG 0.12.0
  GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(webview)

add_executable(iotps_desktop WIN32 main.cpp)
set_target_properties(iotps_desktop PROPERTIES OUTPUT_NAME "IoT Protocol Studio")

target_link_libraries(
  iotps_desktop
  PRIVATE
    iotps::core
    webview::core)

target_compile_features(iotps_desktop PRIVATE cxx_std_20)
target_compile_definitions(iotps_desktop PRIVATE NOMINMAX UNICODE _UNICODE)
iotps_enable_warnings(iotps_desktop)

if(BUILD_TESTING AND IOTPS_BUILD_WEB_UI)
  add_test(NAME iotps_desktop_ui_smoke_test COMMAND iotps_desktop --smoke-test)
  set_tests_properties(iotps_desktop_ui_smoke_test PROPERTIES TIMEOUT 15)
endif()

if(IOTPS_BUILD_WEB_UI)
  find_program(IOTPS_NPM_EXECUTABLE NAMES npm.cmd npm REQUIRED)

  set(IOTPS_WEB_UI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../web-ui")
  set(IOTPS_WEB_UI_DIST "${IOTPS_WEB_UI_DIR}/dist")
  file(
    GLOB_RECURSE IOTPS_WEB_UI_SOURCES
    CONFIGURE_DEPENDS
    "${IOTPS_WEB_UI_DIR}/src/*.ts"
    "${IOTPS_WEB_UI_DIR}/src/*.tsx"
    "${IOTPS_WEB_UI_DIR}/src/*.css")

  add_custom_command(
    OUTPUT "${IOTPS_WEB_UI_DIST}/index.html"
    COMMAND "${IOTPS_NPM_EXECUTABLE}" run build
    WORKING_DIRECTORY "${IOTPS_WEB_UI_DIR}"
    DEPENDS
      ${IOTPS_WEB_UI_SOURCES}
      "${IOTPS_WEB_UI_DIR}/index.html"
      "${IOTPS_WEB_UI_DIR}/package.json"
      "${IOTPS_WEB_UI_DIR}/package-lock.json"
      "${IOTPS_WEB_UI_DIR}/tsconfig.json"
      "${IOTPS_WEB_UI_DIR}/vite.config.ts"
    COMMENT "Building React web UI (run npm install once after cloning)"
    VERBATIM)

  add_custom_target(iotps_web_ui DEPENDS "${IOTPS_WEB_UI_DIST}/index.html")
  add_dependencies(iotps_desktop iotps_web_ui)

  add_custom_command(
    TARGET iotps_desktop
    POST_BUILD
    COMMAND "${CMAKE_COMMAND}" -E rm -rf "$<TARGET_FILE_DIR:iotps_desktop>/web-ui"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory
            "${IOTPS_WEB_UI_DIST}"
            "$<TARGET_FILE_DIR:iotps_desktop>/web-ui"
    COMMENT "Copying web UI beside the Windows executable"
    VERBATIM)
endif()
