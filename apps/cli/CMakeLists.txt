add_executable(iotps_cli main.cpp)
set_target_properties(iotps_cli PROPERTIES OUTPUT_NAME iotps)

target_link_libraries(iotps_cli PRIVATE iotps::core)
target_compile_features(iotps_cli PRIVATE cxx_std_20)
iotps_enable_warnings(iotps_cli)

