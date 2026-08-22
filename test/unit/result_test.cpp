#include "iotps/core/result.hpp"

#include <iostream>
#include <string>

namespace {

int failures = 0;

void check(const bool condition, const char* expression, const int line) {
    if (!condition) {
        std::cerr << "line " << line << ": check failed: " << expression << '\n';
        ++failures;
    }
}

#define CHECK(expression) check((expression), #expression, __LINE__)

enum class SampleErrorCode {
    invalid_value,
};

using SampleError = iotps::core::Error<SampleErrorCode>;

} // namespace

int main() {
    using iotps::core::Result;
    using iotps::core::Status;

    Result<int, SampleError> success{42};
    CHECK(success.has_value());
    CHECK(static_cast<bool>(success));
    CHECK(success.value() == 42);
    CHECK(success.value_if() != nullptr);
    CHECK(success.error_if() == nullptr);

    Result<int, SampleError> failure{SampleError{
        .code = SampleErrorCode::invalid_value,
        .path = "message.status",
        .offset = 3,
        .detail = "expected uint8",
    }};
    CHECK(!failure.has_value());
    CHECK(!static_cast<bool>(failure));
    CHECK(failure.value_if() == nullptr);
    CHECK(failure.error_if() != nullptr);
    CHECK(failure.error().code == SampleErrorCode::invalid_value);
    CHECK(failure.error().path == "message.status");
    CHECK(failure.error().offset == 3);
    CHECK(failure.error().detail == "expected uint8");

    Status<SampleError> status{std::monostate{}};
    CHECK(status.has_value());

    return failures == 0 ? 0 : 1;
}
