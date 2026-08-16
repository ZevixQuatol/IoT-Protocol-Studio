#include "iotps/core/engine.hpp"
#include "iotps/core/version.hpp"

#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>

namespace {

void print_usage() {
    std::cout << "Usage:\n"
                 "  iotps version\n"
                 "  iotps inspect <hex bytes>\n";
}

std::string join_arguments(const int argc, char* argv[], const int first) {
    std::ostringstream output;
    for (int index = first; index < argc; ++index) {
        if (index != first) {
            output << ' ';
        }
        output << argv[index];
    }
    return output.str();
}

void print_byte(const std::uint8_t value) {
    std::cout << "0x" << std::uppercase << std::hex << std::setw(2) << std::setfill('0')
              << static_cast<unsigned int>(value) << std::dec;
}

} // namespace

int main(const int argc, char* argv[]) {
    if (argc < 2) {
        print_usage();
        return 2;
    }

    const std::string command = argv[1];
    if (command == "version") {
        std::cout << iotps::core::product_name << ' ' << iotps::core::version << '\n';
        return 0;
    }

    if (command == "inspect") {
        if (argc < 3) {
            std::cerr << "inspect requires hexadecimal input\n";
            return 2;
        }

        const iotps::core::Engine engine;
        const auto result = engine.inspect_hex(join_arguments(argc, argv, 2));
        if (const auto* error = std::get_if<iotps::core::HexError>(&result)) {
            std::cerr << "error[" << iotps::core::to_string(error->code) << "] at offset "
                      << error->position << ": " << error->message << '\n';
            return 1;
        }

        const auto& inspection = std::get<iotps::core::HexInspection>(result);
        std::cout << "HEX:   " << inspection.normalized_hex << '\n';
        std::cout << "ASCII: " << inspection.ascii << '\n';
        std::cout << "Bytes: " << inspection.bytes.size() << '\n';
        std::cout << "SUM8:  ";
        print_byte(inspection.sum8);
        std::cout << "\nXOR8:  ";
        print_byte(inspection.xor8);
        std::cout << "\nCRC16/MODBUS: 0x" << std::uppercase << std::hex << std::setw(4)
                  << std::setfill('0') << inspection.crc16_modbus << std::dec << '\n';
        return 0;
    }

    print_usage();
    return 2;
}
