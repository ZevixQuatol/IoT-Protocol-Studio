#include "iotps/core/debug.hpp"

#include <iostream>

int main() {
    int failures = 0;
    const auto check = [&](bool ok, const char* label) {
        if (!ok) {
            ++failures;
            std::cerr << label << '\n';
        }
    };
    const auto run = [](std::string_view op, std::initializer_list<std::string> args) {
        return iotps::core::run_debug_tool(op, std::span(args.begin(), args.size()));
    };
    const auto conversion = [&](const std::string& input, const std::string& from,
                                const std::string& to, const std::string& order,
                                const std::string& expected) {
        const auto result = run("convert", {input, from, to, order});
        check(result && result.value().text == expected, (from + " -> " + to).c_str());
    };
    conversion("18446744073709551615", "uint64", "hex", "big", "FF FF FF FF FF FF FF FF");
    conversion("FF FF FF FF FF FF FF FF", "hex", "uint64", "little", "18446744073709551615");
    conversion("-32768", "int16", "hex", "little", "00 80");
    conversion("00 80", "hex", "int16", "little", "-32768");
    conversion("1.5", "float32", "hex", "big", "3F C0 00 00");
    conversion("3F C0 00 00", "hex", "float32", "big", "1.5");
    conversion("41 FF", "hex", "binary", "big", "01000001 11111111");
    conversion("01000001 11111111", "binary", "decimal", "big", "65 255");
    conversion("65 255", "decimal", "hex", "big", "41 FF");
    conversion("hello", "ascii", "base64", "big", "aGVsbG8=");
    conversion("aGVsbG8=", "base64", "ascii", "big", "hello");
    conversion("中文", "utf8", "hex", "big", "E4 B8 AD E6 96 87");
    conversion("E4 B8 AD E6 96 87", "hex", "utf8", "big", "中文");
    conversion("01 02 03", "hex", "reverse", "big", "03 02 01");
    conversion("001234", "bcd", "hex", "little", "34 12 00");
    conversion("34 12 00", "hex", "bcd", "little", "001234");
    conversion("1970-01-01T00:00:00Z", "timestamp-s", "int64", "big", "0");
    conversion("1969-12-31T23:59:59.999Z", "timestamp-ms", "hex", "little",
               "FF FF FF FF FF FF FF FF");
    conversion("-1", "int64", "timestamp-ms", "little", "1969-12-31T23:59:59.999Z");
    conversion("951782400", "int64", "timestamp-s", "big", "2000-02-29T00:00:00Z");
    conversion("253402300799999", "int64", "timestamp-ms", "big", "9999-12-31T23:59:59.999Z");
    conversion("0001-01-01T00:00:00Z", "timestamp-s", "int64", "big", "-62135596800");
    check(!run("convert", {"123", "bcd", "hex", "big"}), "BCD even digit count");
    check(!run("convert", {"FA", "hex", "bcd", "big"}), "BCD digit validation");
    check(!run("convert", {"2025-02-29T00:00:00Z", "timestamp-s", "hex", "big"}),
          "Invalid leap date");
    check(!run("convert", {"2000-01-01T24:00:00Z", "timestamp-s", "hex", "big"}),
          "Invalid UTC hour");
    check(!run("convert", {"9223372036854775807", "int64", "timestamp-s", "big"}),
          "Timestamp overflow guard");
    const auto bits = [&](const char* input, const char* op, const char* operand,
                          const char* expected) {
        const auto result = run("bits", {input, op, operand});
        check(result && result.value().hex == expected, op);
    };
    bits("12 34", "XOR", "FF", "ED CB");
    bits("12 34", "AND", "F0 0F", "10 04");
    bits("12 34", "OR", "01", "13 35");
    bits("81 81", "SHL", "1", "03 02");
    bits("81 81", "SHR", "1", "40 C0");
    bits("81 81", "SHL", "16", "00 00");
    bits("81 81", "SHR", "0", "81 81");
    check(!run("bits", {"01", "SHL", "9"}), "Shift overflow");
    check(!run("bits", {"01", "SHR", "-1"}), "Shift negative");
    check(!run("bits", {"01 02", "XOR", "01 02 03"}), "Mask length");
    for (const auto& item : {"Zh==", "Zg=A", "Zg=", "===="})
        check(!run("convert", {item, "base64", "hex", "big"}), "Base64 validation");
    for (const auto& item : {"C0 AF", "ED A0 80", "F4 90 80 80", "E4 B8"})
        check(!run("convert", {item, "hex", "utf8", "big"}), "UTF-8 validation");
    check(!run("convert", {"256", "uint8", "hex", "big"}), "Integer overflow");
    check(!run("convert", {"-1", "uint64", "hex", "big"}), "Unsigned sign");
    check(!run("convert", {"NaN", "float32", "hex", "big"}), "Nonfinite float");
    check(!run("convert", {"FF", "hex", "uint16", "big"}), "Numeric width");
    check(!run("convert", {"FF", "hex", "ascii", "big"}), "ASCII range");
    check(!run("convert", {"100000000", "binary", "hex", "big"}), "Binary width");
    check(!run("convert", {"256", "decimal", "hex", "big"}), "Decimal byte range");
    const auto found = run("find", {"AA AA AA AA", "AA AA", ""});
    check(found && found.value().matches == std::vector<std::size_t>{0, 2},
          "Nonoverlapping matches");
    const auto replaced = run("replace", {"AA AA AA AA", "AA AA", "01"});
    check(replaced && replaced.value().hex == "01 01", "Byte replacement");
    const auto removed = run("replace", {"AA AA", "AA", ""});
    check(removed && removed.value().hex.empty(), "Delete all bytes");
    check(!run("find", {"AA", "", ""}), "Empty needle");
    const std::string standard = "31 32 33 34 35 36 37 38 39";
    const auto crc = [&](std::initializer_list<std::string> params, const char* expected) {
        std::vector<std::string> args{standard, "CRC", "0", "8"};
        args.insert(args.end(), params);
        auto result = iotps::core::run_debug_tool("checksum", args);
        check(result && result.value().text == expected, expected);
    };
    crc({"8", "07", "00", "0", "0", "00"}, "F4");
    crc({"16", "8005", "FFFF", "1", "1", "0000"}, "4B37");
    crc({"16", "1021", "FFFF", "0", "0", "0000"}, "29B1");
    crc({"16", "1021", "0000", "0", "0", "0000"}, "31C3");
    crc({"32", "04C11DB7", "FFFFFFFF", "1", "1", "FFFFFFFF"}, "CBF43926");
    auto range = run("checksum", {"FF 01 02 FF", "SUM8", "1", "2", "8", "07", "0", "0", "0", "0"});
    check(range && range.value().text == "03", "Inclusive checksum range");
    check(!run("checksum", {standard, "CRC", "0", "9", "16", "1021", "0", "0", "0", "0"}),
          "Range overflow");
    check(!run("checksum", {standard, "CRC", "0", "8", "8", "1021", "0", "0", "0", "0"}),
          "CRC parameter overflow");
    check(!run("checksum", {standard, "CRC", "0", "8", "64", "1021", "0", "0", "0", "0"}),
          "Unsupported CRC width");
    return failures ? 1 : 0;
}
