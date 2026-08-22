#include "iotps/core/engine.hpp"

#include "iotps/core/checksum.hpp"

namespace iotps::core {

HexInspectionResult Engine::inspect_hex(const std::string_view input) const {
    auto parsed = parse_hex(input);
    if (const auto* error = parsed.error_if()) {
        return *error;
    }

    auto bytes = std::move(parsed).value();
    HexInspection inspection{
        .bytes = std::move(bytes),
    };
    inspection.normalized_hex = format_hex(inspection.bytes);
    inspection.ascii = ascii_preview(inspection.bytes);
    inspection.sum8 = iotps::core::sum8(inspection.bytes);
    inspection.xor8 = iotps::core::xor8(inspection.bytes);
    inspection.crc16_modbus = iotps::core::crc16_modbus(inspection.bytes);
    return inspection;
}

} // namespace iotps::core
