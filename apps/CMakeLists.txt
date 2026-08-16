if(IOTPS_BUILD_CLI)
  add_subdirectory(cli)
endif()

if(IOTPS_BUILD_DESKTOP_WIN)
  if(NOT WIN32)
    message(FATAL_ERROR "IOTPS_BUILD_DESKTOP_WIN requires a Windows toolchain")
  endif()
  add_subdirectory(desktop-win)
endif()

