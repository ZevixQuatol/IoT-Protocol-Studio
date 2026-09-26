#include "iotps/core/transport/framing.hpp"

#include <algorithm>
#include <stdexcept>
#include <utility>

namespace iotps::core::transport {

std::string frame_rule_error(const FrameRule& rule) {
    switch (rule.mode) {
    case FrameMode::off:
        return {};
    case FrameMode::fixed:
        return rule.fixed_size == 0 || rule.fixed_size > max_frame_buffer
                   ? "fixed frame size must be 1 to 1048576 bytes"
                   : "";
    case FrameMode::length_field:
        if (rule.length_size != 1 && rule.length_size != 2 && rule.length_size != 4)
            return "length field width must be 1, 2 or 4 bytes";
        if (rule.length_offset > max_frame_buffer - rule.length_size ||
            rule.length_adjustment > max_frame_buffer)
            return "length field or adjustment exceeds frame buffer";
        return {};
    case FrameMode::delimiter:
        return rule.delimiter.empty() || rule.delimiter.size() > 32
                   ? "delimiter must be 1 to 32 bytes"
                   : "";
    }
    return "unknown frame mode";
}

void FrameAssembler::configure(FrameRule rule) {
    if (const auto error = frame_rule_error(rule); !error.empty())
        throw std::invalid_argument(error);
    rule_ = std::move(rule);
    pending_.clear();
}

std::optional<FrameOutput> FrameAssembler::discard(const std::string_view reason) {
    if (pending_.empty())
        return std::nullopt;
    const auto count = pending_.size();
    pending_.clear();
    return FrameOutput{{},
                       "partial frame: " + std::to_string(count) + " byte(s) discarded (" +
                           std::string{reason} + ")"};
}

std::optional<FrameOutput> FrameAssembler::expire(const std::chrono::steady_clock::time_point now) {
    return !pending_.empty() && now - last_byte_ >= frame_idle_timeout ? discard("5s idle timeout")
                                                                       : std::nullopt;
}

std::vector<FrameOutput> FrameAssembler::feed(const std::span<const std::uint8_t> bytes,
                                              const std::chrono::steady_clock::time_point now) {
    std::vector<FrameOutput> output;
    if (const auto expired = expire(now))
        output.push_back(*expired);
    if (rule_.mode == FrameMode::off || bytes.empty())
        return output;
    if (bytes.size() > max_frame_buffer - pending_.size()) {
        pending_.clear();
        output.push_back({{}, "frame buffer limit exceeded; pending and incoming bytes discarded"});
        return output;
    }
    const auto old_size = pending_.size();
    pending_.insert(pending_.end(), bytes.begin(), bytes.end());
    last_byte_ = now;
    auto search_from = rule_.mode == FrameMode::delimiter && old_size >= rule_.delimiter.size()
                           ? old_size - rule_.delimiter.size() + 1
                           : 0;
    for (;;) {
        std::size_t frame_size = 0;
        if (rule_.mode == FrameMode::fixed) {
            frame_size = rule_.fixed_size;
        } else if (rule_.mode == FrameMode::delimiter) {
            const auto end = std::search(pending_.begin() + search_from, pending_.end(),
                                         rule_.delimiter.begin(), rule_.delimiter.end());
            if (end == pending_.end())
                break;
            frame_size = static_cast<std::size_t>(end - pending_.begin()) + rule_.delimiter.size();
        } else {
            const auto header_size = rule_.length_offset + rule_.length_size;
            if (pending_.size() < header_size)
                break;
            std::size_t length = 0;
            for (std::size_t i = 0; i < rule_.length_size; ++i) {
                const auto index = rule_.little_endian ? rule_.length_size - i - 1 : i;
                length = (length << 8) | pending_[rule_.length_offset + index];
            }
            if (length > max_frame_buffer - rule_.length_adjustment ||
                length + rule_.length_adjustment < header_size) {
                pending_.clear();
                output.push_back({{},
                                  "invalid frame length " + std::to_string(length) +
                                      "; pending bytes discarded"});
                break;
            }
            frame_size = length + rule_.length_adjustment;
        }
        if (pending_.size() < frame_size)
            break;
        output.push_back({ByteBuffer{pending_.begin(), pending_.begin() + frame_size}, {}});
        // ponytail: front erase is O(n) per frame; use a ring buffer if tiny-frame throughput
        // matters.
        pending_.erase(pending_.begin(), pending_.begin() + frame_size);
        search_from = 0;
    }
    return output;
}

} // namespace iotps::core::transport
