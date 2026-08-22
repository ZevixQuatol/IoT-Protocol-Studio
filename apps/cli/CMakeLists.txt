add_executable(iotps_cli main.cpp)
set_target_properties(iotps_cli PROPERTIES OUTPUT_NAME iotps)

target_link_libraries(iotps_cli PRIVATE iotps::core)
target_compile_features(iotps_cli PRIVATE cxx_std_20)
iotps_enable_warnings(iotps_cli)

if(BUILD_TESTING)
  add_test(
    NAME iotps_cli_schema_validate_test
    COMMAND iotps_cli schema validate
            "${PROJECT_SOURCE_DIR}/test/vectors/smart-sensor.yaml")
  add_test(
    NAME iotps_cli_schema_reject_test
    COMMAND iotps_cli schema validate
            "${PROJECT_SOURCE_DIR}/test/vectors/invalid-schema.yaml")
  set_tests_properties(iotps_cli_schema_reject_test PROPERTIES WILL_FAIL TRUE)
endif()
