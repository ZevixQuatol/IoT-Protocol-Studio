#pragma once

#include "iotps/core/schema/schema.hpp"

#include <filesystem>
#include <string>
#include <string_view>

namespace iotps::core::schema {

using SchemaLoadResult = Result<ProtocolSchema, SchemaDiagnostic>;

[[nodiscard]] SchemaLoadResult load_yaml(std::string_view yaml,
                                         std::string source_name = "<memory>");
[[nodiscard]] SchemaLoadResult load_yaml_file(const std::filesystem::path& path);

} // namespace iotps::core::schema
