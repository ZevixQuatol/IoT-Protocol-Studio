#include "iotps/core/testing/testing.hpp"

#include <algorithm>
#include <utility>

namespace iotps::core::testing {

AssertionResult evaluate(const Assertion& assertion, const codec::ScalarValue& actual) {
    const auto equal = assertion.expected == actual;
    const auto passed = assertion.operation == AssertionOperator::equals ? equal : !equal;
    return {
        .passed = passed,
        .path = assertion.path,
        .expected = assertion.expected,
        .actual = actual,
    };
}

TestReport make_report(const TestCase& test_case, std::vector<StepResult> steps) {
    const auto has_failed = std::ranges::any_of(steps, [](const StepResult& step) {
        return step.status == StepStatus::failed;
    });
    const auto has_passed = std::ranges::any_of(steps, [](const StepResult& step) {
        return step.status == StepStatus::passed;
    });

    const auto status = has_failed ? TestStatus::failed
                                   : (has_passed ? TestStatus::passed : TestStatus::skipped);
    return {
        .test_case_id = test_case.id,
        .status = status,
        .steps = std::move(steps),
    };
}

std::string_view to_string(const TestStatus status) noexcept {
    switch (status) {
    case TestStatus::passed:
        return "passed";
    case TestStatus::failed:
        return "failed";
    case TestStatus::skipped:
        return "skipped";
    }
    return "unknown";
}

} // namespace iotps::core::testing
