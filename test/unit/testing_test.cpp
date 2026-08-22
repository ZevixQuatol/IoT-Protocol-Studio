#include "iotps/core/testing/testing.hpp"

#include <cstdint>
#include <iostream>

namespace {

int failures = 0;

void check(const bool condition, const char* expression, const int line) {
    if (!condition) {
        std::cerr << "line " << line << ": check failed: " << expression << '\n';
        ++failures;
    }
}

#define CHECK(expression) check((expression), #expression, __LINE__)

} // namespace

int main() {
    using namespace iotps::core;

    const testing::Assertion equals{
        .path = "response.status",
        .operation = testing::AssertionOperator::equals,
        .expected = std::uint64_t{0},
    };
    const auto passed = testing::evaluate(equals, std::uint64_t{0});
    CHECK(passed.passed);
    CHECK(passed.path == "response.status");

    const auto failed = testing::evaluate(equals, std::uint64_t{1});
    CHECK(!failed.passed);
    CHECK(failed.expected == codec::ScalarValue{std::uint64_t{0}});
    CHECK(failed.actual == codec::ScalarValue{std::uint64_t{1}});

    const testing::TestCase test_case{
        .id = "status-test",
        .name = "Status should be zero",
        .steps = {
            {.name = "connect", .kind = testing::TestStepKind::connect},
            {.name = "assert status", .kind = testing::TestStepKind::assertion},
            {.name = "cleanup", .kind = testing::TestStepKind::cleanup},
        },
    };
    const auto report = testing::make_report(
        test_case,
        {
            {.name = "connect", .status = testing::StepStatus::passed},
            {.name = "assert status",
             .status = testing::StepStatus::failed,
             .error_code = "assertion_failed"},
            {.name = "cleanup", .status = testing::StepStatus::passed},
        });
    CHECK(report.test_case_id == "status-test");
    CHECK(report.status == testing::TestStatus::failed);
    CHECK(report.steps.size() == 3);

    return failures == 0 ? 0 : 1;
}
