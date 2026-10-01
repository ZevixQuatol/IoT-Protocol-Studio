#include "iotps/core/transport/correlation.hpp"

#include <algorithm>
#include <tuple>

namespace iotps::core::transport {
std::string correlation_rule_error(const CorrelationRule& rule) {
    const auto text = [](const std::string& value, std::size_t limit) {
        return value.find_first_not_of(' ') != std::string::npos && value.size() <= limit &&
               std::ranges::none_of(value, [](unsigned char c) { return c < 32 || c == 127; });
    };
    if (!text(rule.protocol, 1024) || !text(rule.request_message, 256) ||
        !text(rule.response_message, 256) || !text(rule.request_field, 256) ||
        !text(rule.response_field, 256) ||
        (rule.request_flow != "TX" && rule.request_flow != "RX") ||
        (rule.scope != "connection" && rule.scope != "session") || rule.timeout_ms < 1 ||
        rule.timeout_ms > 3600000)
        return "Select protocol, messages and fields; timeout must be 1-3600000 ms";
    return {};
}
std::vector<Correlation> correlate(std::span<const TcpRecord> records, const CorrelationRule& rule,
                                   std::int64_t now_ms) {
    if (!correlation_rule_error(rule).empty())
        return {};
    using Key = std::tuple<std::string, std::string, std::uint64_t, std::string>;
    struct Request {
        Key key;
        std::int64_t time;
        std::size_t row;
    };
    std::vector<Request> requests;
    std::vector<Correlation> rows;
    for (const auto& record : records) {
        if (record.direction != "FRAME" || !record.parsed ||
            record.parsed->protocol_path != rule.protocol)
            continue;
        const auto& parsed = *record.parsed;
        const auto flow = record.flow.empty() ? "RX" : record.flow;
        const bool request =
            flow == rule.request_flow && parsed.message_name == rule.request_message;
        const bool response =
            flow != rule.request_flow && parsed.message_name == rule.response_message;
        if (!request && !response)
            continue;
        const auto field = std::ranges::find_if(parsed.fields, [&](const auto& item) {
            return item.name == (request ? rule.request_field : rule.response_field);
        });
        if (parsed.status != "ok" || field == parsed.fields.end() || field->type.empty() ||
            field->value.empty() || field->value.size() > 512) {
            rows.push_back({request ? record.id : 0, response ? record.id : 0, "skipped",
                            "Frame is invalid or correlation field is missing/truncated"});
            continue;
        }
        Key key{field->type, field->value, rule.scope == "connection" ? record.peer : 0,
                rule.scope == "connection" ? record.address : ""};
        if (request) {
            requests.push_back({std::move(key), record.time_ms, rows.size()});
            rows.push_back({record.id, 0, "pending", "Waiting for response"});
            continue;
        }
        std::size_t candidates = 0;
        const Request* previous = nullptr;
        // ponytail: bounded retained ring (1000 records); index keys if the ring limit grows.
        for (std::size_t index = 0; index < requests.size(); ++index) {
            const auto& candidate = requests[index];
            if (candidate.key != key || record.time_ms < candidate.time)
                continue;
            previous = &candidate;
            ++candidates;
        }
        if (candidates == 1 && rows[previous->row].response == 0 &&
            record.time_ms - previous->time <= rule.timeout_ms) {
            const auto& candidate = *previous;
            auto& row = rows[candidate.row];
            row.response = record.id;
            row.elapsed_ms = record.time_ms - candidate.time;
            row.state = "matched";
            row.reason = "Matching field and scope within timeout";
        } else if (candidates > 1) {
            rows.push_back({0, record.id, "ambiguous", "Multiple retained requests share the key"});
        } else if (previous) {
            auto& row = rows[previous->row];
            const bool duplicate = row.response != 0;
            const auto request_id = row.request;
            if (!duplicate) {
                row.response = record.id;
                row.elapsed_ms = record.time_ms - previous->time;
                row.state = "timeout";
                row.reason = "No unique response within timeout";
            }
            rows.push_back(
                {request_id, record.id, duplicate ? "duplicate" : "late",
                 duplicate ? "Request already has a response" : "Response arrived after timeout",
                 record.time_ms - previous->time});
        } else {
            rows.push_back({0, record.id, "unmatched", "No matching request in retained records"});
        }
    }
    for (const auto& request : requests) {
        auto& row = rows[request.row];
        if (row.state == "pending" && now_ms >= request.time &&
            now_ms - request.time >= rule.timeout_ms) {
            row.state = "timeout";
            row.reason = "No unique response within timeout";
        }
    }
    return rows;
}
} // namespace iotps::core::transport
