#include "iotps/core/transport/framing.hpp"

#include <chrono>
#include <initializer_list>
#include <iostream>
#include <source_location>
#include <stdexcept>

using namespace iotps::core::transport;
using iotps::core::ByteBuffer;
using namespace std::chrono_literals;

void check(bool value, const std::source_location where = std::source_location::current()) {
    if (!value)
        throw std::runtime_error("framing check failed at line " + std::to_string(where.line()));
}

int main() {
    try {
        const auto now = std::chrono::steady_clock::time_point{};
        FrameAssembler framer;
        const auto feed = [&](std::initializer_list<std::uint8_t> bytes,
                              std::chrono::steady_clock::time_point at) {
            return framer.feed({bytes.begin(), bytes.size()}, at);
        };
        FrameRule rule;
        rule.mode = FrameMode::fixed;
        rule.fixed_size = 3;
        check(frame_rule_error(rule).empty());
        framer.configure(rule);
        check(feed({1}, now).empty());
        auto frames = feed({2, 3, 4, 5, 6}, now);
        check(frames.size() == 2 && frames[0].bytes == ByteBuffer({1, 2, 3}) &&
              frames[1].bytes == ByteBuffer({4, 5, 6}));
        check(!framer.discard("done"));

        rule.mode = FrameMode::length_field;
        rule.length_offset = 1;
        rule.length_size = 2;
        rule.length_adjustment = 3;
        check(frame_rule_error(rule).empty());
        framer.configure(rule);
        check(feed({0xAA, 0}, now).empty());
        frames = feed({2, 0x10, 0x11, 0xBB, 0, 2, 0x20, 0x21}, now);
        check(frames.size() == 2 && frames[0].bytes == ByteBuffer({0xAA, 0, 2, 0x10, 0x11}) &&
              frames[1].bytes == ByteBuffer({0xBB, 0, 2, 0x20, 0x21}));
        rule.length_adjustment = 0;
        framer.configure(rule);
        frames = feed({0xAA, 0, 0}, now);
        check(frames.size() == 1 && !frames[0].error.empty());
        rule.length_adjustment = 3;
        framer.configure(rule);
        frames = feed({0xAA, 0, 1, 0x30}, now);
        check(frames.size() == 1 && frames[0].bytes == ByteBuffer({0xAA, 0, 1, 0x30}));
        rule.little_endian = true;
        framer.configure(rule);
        frames = feed({0xAA, 1, 0, 0x30}, now);
        check(frames.size() == 1 && frames[0].bytes.size() == 4);

        rule.mode = FrameMode::delimiter;
        rule.delimiter = {0x0D, 0x0A};
        framer.configure(rule);
        check(feed({0x41, 0x0D}, now).empty());
        frames = feed({0x0A, 0x42, 0x0D, 0x0A, 0x43}, now);
        check(frames.size() == 2 && frames[0].bytes == ByteBuffer({0x41, 0x0D, 0x0A}) &&
              frames[1].bytes == ByteBuffer({0x42, 0x0D, 0x0A}));
        check(framer.expire(now + 4s) == std::nullopt);
        auto expired = framer.expire(now + 5s);
        check(expired && !expired->error.empty());
        frames = feed({0x44, 0x0D, 0x0A}, now + 6s);
        check(frames.size() == 1 && frames[0].bytes == ByteBuffer({0x44, 0x0D, 0x0A}));
        check(feed({0x55}, now).empty());
        check(framer.discard("disconnect").has_value());

        rule.mode = FrameMode::fixed;
        rule.fixed_size = 2;
        framer.configure(rule);
        ByteBuffer too_large(max_frame_buffer + 1, 0xFF);
        frames = framer.feed(too_large, now);
        check(frames.size() == 1 && !frames[0].error.empty());
        frames = feed({7, 8}, now);
        check(frames.size() == 1 && frames[0].bytes == ByteBuffer({7, 8}));
        rule.mode = FrameMode::delimiter;
        rule.delimiter = {0x0A};
        framer.configure(rule);
        ByteBuffer pending(max_frame_buffer, 0xFF);
        check(framer.feed(pending, now).empty());
        frames = feed({0x01}, now);
        check(frames.size() == 1 && !frames[0].error.empty());
        frames = feed({0x42, 0x0A}, now);
        check(frames.size() == 1 && frames[0].bytes == ByteBuffer({0x42, 0x0A}));
        rule.mode = FrameMode::fixed;
        rule.fixed_size = 0;
        check(!frame_rule_error(rule).empty());
        rule.mode = FrameMode::length_field;
        rule.length_size = 3;
        check(!frame_rule_error(rule).empty());
        rule.mode = FrameMode::delimiter;
        rule.delimiter.clear();
        check(!frame_rule_error(rule).empty());
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
