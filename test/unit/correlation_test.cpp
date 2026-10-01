#include "iotps/core/transport/capture.hpp"
#include "iotps/core/transport/correlation.hpp"

#include <iostream>
#include <stdexcept>
using namespace iotps::core::transport;
void check(bool ok, const char* text) {
    if (!ok)
        throw std::runtime_error(text);
}
TcpRecord frame(std::uint64_t id, std::int64_t time, std::string flow, std::string value,
                std::uint64_t peer = 1) {
    TcpRecord record{};
    record.id = id;
    record.time_ms = time;
    record.direction = "FRAME";
    record.flow = flow;
    record.peer = peer;
    record.address = "endpoint";
    record.parsed = TcpParse{.protocol_path = "wire.yaml",
                             .message_name = flow == "TX" ? "ask" : "reply",
                             .status = "ok"};
    record.parsed->fields.push_back(
        {.name = flow == "TX" ? "seq" : "ack", .type = "uint16", .value = std::move(value)});
    return record;
}
int main() {
    try {
        CorrelationRule rule{"wire.yaml", "ask", "reply", "seq", "ack", "TX", "connection", 100};
        check(correlation_rule_error(rule).empty(), "valid rule");
        auto invalid = rule;
        invalid.timeout_ms = 0;
        check(!correlation_rule_error(invalid).empty(), "timeout validation");
        invalid = rule;
        invalid.scope = "global";
        check(!correlation_rule_error(invalid).empty(), "scope validation");
        invalid = rule;
        invalid.request_field = "bad\nfield";
        check(!correlation_rule_error(invalid).empty(), "field validation");
        std::vector<TcpRecord> records{frame(1, 1000, "TX", "7"), frame(2, 1010, "RX", "8"),
                                       frame(3, 1100, "RX", "7"), frame(4, 1101, "RX", "7")};
        auto rows = correlate(records, rule, 2000);
        check(rows.size() == 3 && rows[0].state == "matched" && rows[0].response == 3 &&
                  rows[0].elapsed_ms == 100,
              "field match at inclusive timeout boundary, never next RX");
        check(rows[1].state == "unmatched" && rows[2].state == "duplicate",
              "unmatched and duplicate responses");
        records = {frame(1, 1000, "TX", "7"), frame(2, 1005, "TX", "8"), frame(3, 1030, "RX", "8"),
                   frame(4, 1040, "RX", "7")};
        rows = correlate(records, rule, 1040);
        check(rows[0].response == 4 && rows[1].response == 3, "out of order replies");
        records = {frame(1, 1000, "TX", "7"), frame(2, 1001, "RX", "7", 2)};
        rows = correlate(records, rule, 1100);
        check(rows[0].state == "timeout" && rows[1].state == "unmatched",
              "connection IDs isolate reconnects");
        rule.scope = "session";
        check(correlate(records, rule, 1100)[0].state == "matched",
              "explicit session scope crosses connections");
        rule.scope = "connection";
        records = {frame(1, 1000, "TX", "7"), frame(2, 1101, "RX", "7"), frame(3, 1102, "RX", "7")};
        rows = correlate(records, rule, 1102);
        check(rows[0].state == "timeout" && rows[1].state == "late" && rows[2].state == "duplicate",
              "late response preserves timeout and subsequent duplicates");
        check(correlate(std::span<const TcpRecord>{records}.first(1), rule, 1099)[0].state ==
                  "pending",
              "pending before deadline");
        check(correlate(std::span<const TcpRecord>{records}.first(1), rule, 1100)[0].state ==
                  "timeout",
              "timeout advances without traffic");
        records = {frame(1, 1000, "TX", "7"), frame(2, 1001, "TX", "7"), frame(3, 1002, "RX", "7")};
        rows = correlate(records, rule, 1002);
        check(rows.size() == 3 && rows[0].state == "pending" && rows[1].state == "pending" &&
                  rows[2].state == "ambiguous",
              "never guess among simultaneous identical keys");
        records = {frame(1, 1000, "TX", "7"), frame(2, 1001, "RX", "7")};
        auto reused = std::vector<TcpRecord>{frame(1, 1000, "TX", "7"), frame(2, 1200, "TX", "7"),
                                             frame(3, 1201, "RX", "7")};
        check(correlate(reused, rule, 1201).back().state == "ambiguous",
              "expired key reuse cannot steal a late response");
        reused = {frame(1, 1000, "TX", "7"), frame(2, 1001, "RX", "7"), frame(3, 1002, "TX", "7"),
                  frame(4, 1003, "RX", "7")};
        check(correlate(reused, rule, 1003).back().state == "ambiguous",
              "completed key reuse cannot steal a duplicate response");
        records[1].parsed->fields[0].type = "uint32";
        check(correlate(records, rule, 1001)[1].state == "unmatched", "field types must agree");
        records[1].parsed->status = "error";
        check(correlate(records, rule, 1001)[1].state == "skipped",
              "bad checksum or parse never correlates");
        records[1].parsed->status = "ok";
        records[1].parsed->fields.clear();
        check(correlate(records, rule, 1001)[1].state == "skipped", "missing keys skipped");
        records[1] = frame(2, 1001, "RX", std::string(513, 'a'));
        check(correlate(records, rule, 1001)[1].state == "skipped", "truncated key skipped");
        // A four-byte UTF-8 scalar crossing byte 512 produces a 512-byte truncated preview.
        iotps::core::schema::ProtocolSchema unicode{
            .protocol = {.name = "unicode", .version = "1"},
            .messages = {{.name = "reply",
                          .fields = {{.name = "ack",
                                      .type = iotps::core::schema::FieldType::string,
                                      .length = 513}}}}};
        iotps::core::ByteBuffer text(509, 'a');
        text.insert(text.end(), {0xf0, 0x9f, 0x98, 0x80});
        auto snapshot = parse_frame(&unicode, "wire.yaml", "reply", text);
        check(snapshot && snapshot->status == "ok" && snapshot->fields[0].value.size() == 512 &&
                  snapshot->fields[0].truncated,
              "UTF-8-safe preview explicitly records truncation");
        records = {frame(1, 1000, "TX", snapshot->fields[0].value),
                   frame(2, 1001, "RX", snapshot->fields[0].value)};
        records[0].parsed->fields[0].type = "string";
        records[1].parsed = snapshot;
        check(correlate(records, rule, 1001)[1].state == "skipped",
              "shortened Unicode preview cannot correlate distinct original values");
        auto empty_array = unicode;
        empty_array.messages[0].fields = {
            {.name = "count", .type = iotps::core::schema::FieldType::uint8},
            {.name = "items",
             .type = iotps::core::schema::FieldType::array,
             .element_type = iotps::core::schema::FieldType::uint8,
             .count_from = "count",
             .max_count = 1024}};
        snapshot = parse_frame(&empty_array, "wire.yaml", "reply", iotps::core::ByteBuffer{0});
        check(snapshot && snapshot->status == "ok" && snapshot->fields[1].length == 0 &&
                  snapshot->fields[1].value == "[]",
              "zero-count dynamic array retains its empty value and zero-width range");
        auto many_fields = unicode;
        many_fields.messages[0].fields.clear();
        for (int i = 0; i < 1001; ++i)
            many_fields.messages[0].fields.push_back(
                {.name = "value" + std::to_string(i),
                 .type = iotps::core::schema::FieldType::uint8});
        snapshot = parse_frame(&many_fields, "wire.yaml", "reply", iotps::core::ByteBuffer(1001));
        check(snapshot && snapshot->status == "error" && snapshot->fields.empty() &&
                  snapshot->error.find("1000 fields") != std::string::npos,
              "oversized record snapshot reports its limit instead of creating an invalid archive");
        records[1] = frame(2, 1001, "RX", "7");
        records[1] = frame(2, 1001, "RX", "7");
        records[1].parsed->protocol_path = "other.yaml";
        check(correlate(records, rule, 1001).size() == 1, "protocol isolation");
        records = {frame(1, 1000, "TX", "7"), frame(2, 1001, "RX", "7")};
        records[0].flow = "RX";
        records[1].flow = "TX";
        rule.request_flow = "RX";
        check(correlate(records, rule, 1001)[0].state == "matched",
              "server receives request and sends response");
        rule.request_flow = "TX";
        records = {frame(2, 1001, "RX", "7")};
        check(correlate(records, rule, 1001)[0].state == "unmatched",
              "evicted requests are never fabricated");
        records[0].direction = "RX";
        check(correlate(records, rule, 1001).empty(), "raw bytes excluded");
        std::cout << "correlation checks passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
