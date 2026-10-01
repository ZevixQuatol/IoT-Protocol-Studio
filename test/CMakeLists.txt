function(iotps_add_test target source module)
  add_executable(${target} ${source})
  target_link_libraries(${target} PRIVATE ${module})
  target_compile_features(${target} PRIVATE cxx_std_20)
  iotps_enable_warnings(${target})
  add_test(NAME ${target} COMMAND ${target})
endfunction()

iotps_add_test(iotps_hex_unit_test unit/hex_test.cpp iotps::codec)
iotps_add_test(iotps_tcp_integration_test integration/tcp_test.cpp iotps::transport)
iotps_add_test(iotps_endpoint_integration_test integration/endpoint_test.cpp iotps::transport)
set_tests_properties(iotps_endpoint_integration_test PROPERTIES TIMEOUT 30)
iotps_add_test(iotps_framing_unit_test unit/framing_test.cpp iotps::transport)
set_tests_properties(iotps_tcp_integration_test PROPERTIES TIMEOUT 30)
iotps_add_test(iotps_checksum_unit_test unit/checksum_test.cpp iotps::codec)
iotps_add_test(iotps_debug_unit_test unit/debug_test.cpp iotps::codec)
iotps_add_test(iotps_result_unit_test unit/result_test.cpp iotps::common)
iotps_add_test(iotps_schema_unit_test unit/schema_test.cpp iotps::schema)
iotps_add_test(iotps_schema_loader_unit_test unit/schema_loader_test.cpp iotps::schema)
iotps_add_test(iotps_workspace_unit_test unit/workspace_test.cpp iotps::workspace)
iotps_add_test(iotps_codec_unit_test unit/codec_test.cpp iotps::codec)
iotps_add_test(
  iotps_primitive_decode_integration_test
  integration/primitive_decode_test.cpp
  iotps::codec)
iotps_add_test(
  iotps_primitive_encode_integration_test
  integration/primitive_encode_test.cpp
  iotps::codec)
iotps_add_test(
  iotps_fixed_text_integration_test
  integration/fixed_text_test.cpp
  iotps::codec)
iotps_add_test(
  iotps_length_field_integration_test
  integration/length_field_test.cpp
  iotps::codec)
iotps_add_test(
  iotps_fixed_array_integration_test
  integration/fixed_array_test.cpp
  iotps::codec)
iotps_add_test(
  iotps_protocol_codec_integration_test
  integration/protocol_codec_test.cpp
  iotps::codec)
iotps_add_test(iotps_testing_unit_test unit/testing_test.cpp iotps::testing)
iotps_add_test(iotps_correlation_unit_test unit/correlation_test.cpp iotps::transport)
iotps_add_test(
  iotps_simulator_integration_test
  integration/simulator_test.cpp
  iotps::simulator)
iotps_add_test(iotps_engine_integration_test integration/engine_test.cpp iotps::core)

target_compile_definitions(
  iotps_engine_integration_test
  PRIVATE IOTPS_TEST_VECTOR_DIR="${CMAKE_CURRENT_SOURCE_DIR}/vectors")
target_compile_definitions(
  iotps_schema_loader_unit_test
  PRIVATE IOTPS_TEST_VECTOR_DIR="${CMAKE_CURRENT_SOURCE_DIR}/vectors")
target_compile_definitions(
  iotps_workspace_unit_test
  PRIVATE IOTPS_TEST_VECTOR_DIR="${CMAKE_CURRENT_SOURCE_DIR}/vectors")
target_compile_definitions(
  iotps_primitive_decode_integration_test
  PRIVATE IOTPS_TEST_VECTOR_DIR="${CMAKE_CURRENT_SOURCE_DIR}/vectors")
target_compile_definitions(
  iotps_primitive_encode_integration_test
  PRIVATE IOTPS_TEST_VECTOR_DIR="${CMAKE_CURRENT_SOURCE_DIR}/vectors")
target_compile_definitions(
  iotps_fixed_text_integration_test
  PRIVATE IOTPS_TEST_VECTOR_DIR="${CMAKE_CURRENT_SOURCE_DIR}/vectors")
target_compile_definitions(
  iotps_length_field_integration_test
  PRIVATE IOTPS_TEST_VECTOR_DIR="${CMAKE_CURRENT_SOURCE_DIR}/vectors")
target_compile_definitions(
  iotps_fixed_array_integration_test
  PRIVATE IOTPS_TEST_VECTOR_DIR="${CMAKE_CURRENT_SOURCE_DIR}/vectors")
target_compile_definitions(
  iotps_protocol_codec_integration_test
  PRIVATE IOTPS_TEST_VECTOR_DIR="${CMAKE_CURRENT_SOURCE_DIR}/vectors")

if(IOTPS_BUILD_FUZZ)
  if(NOT CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    message(FATAL_ERROR "IOTPS_BUILD_FUZZ currently requires Clang")
  endif()

  add_executable(iotps_hex_fuzz fuzz/hex_fuzz.cpp)
  target_link_libraries(iotps_hex_fuzz PRIVATE iotps::codec)
  target_compile_options(iotps_hex_fuzz PRIVATE -fsanitize=fuzzer,address)
  target_link_options(iotps_hex_fuzz PRIVATE -fsanitize=fuzzer,address)
endif()
