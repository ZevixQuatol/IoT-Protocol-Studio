function(iotps_add_test target source)
  add_executable(${target} ${source})
  target_link_libraries(${target} PRIVATE iotps::core)
  target_compile_features(${target} PRIVATE cxx_std_20)
  iotps_enable_warnings(${target})
  add_test(NAME ${target} COMMAND ${target})
endfunction()

iotps_add_test(iotps_hex_unit_test unit/hex_test.cpp)
iotps_add_test(iotps_checksum_unit_test unit/checksum_test.cpp)
iotps_add_test(iotps_engine_integration_test integration/engine_test.cpp)

target_compile_definitions(
  iotps_engine_integration_test
  PRIVATE IOTPS_TEST_VECTOR_DIR="${CMAKE_CURRENT_SOURCE_DIR}/vectors")

if(IOTPS_BUILD_FUZZ)
  if(NOT CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    message(FATAL_ERROR "IOTPS_BUILD_FUZZ currently requires Clang")
  endif()

  add_executable(iotps_hex_fuzz fuzz/hex_fuzz.cpp)
  target_link_libraries(iotps_hex_fuzz PRIVATE iotps::core)
  target_compile_options(iotps_hex_fuzz PRIVATE -fsanitize=fuzzer,address)
  target_link_options(iotps_hex_fuzz PRIVATE -fsanitize=fuzzer,address)
endif()

