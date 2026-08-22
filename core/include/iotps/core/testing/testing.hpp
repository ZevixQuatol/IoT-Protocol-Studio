#pragma once

#include "iotps/core/codec/codec.hpp"

#include <string>
#include <string_view>
#include <vector>

namespace iotps::core::testing {

enum class AssertionOperator {
    equals,
    not_equals,
};

struct Assertion {
    std::string path;
    AssertionOperator operation{AssertionOperator::equals};
    codec::ScalarValue expected;
};

struct AssertionResult {
    bool passed;
    std::string path;
    codec::ScalarValue expected;
    codec::ScalarValue actual;
};

[[nodiscard]] AssertionResult evaluate(const Assertion& assertion,
                                       const codec::ScalarValue& actual);

enum class TestStepKind {
    setup,
    connect,
    send,
    receive,
    decode,
    assertion,
    cleanup,
};

struct TestStep {
    std::string name;
    TestStepKind kind{TestStepKind::setup};
};

struct TestCase {
    std::string id;
    std::string name;
    std::vector<TestStep> steps;
};

enum class StepStatus {
    passed,
    failed,
    skipped,
};

struct StepResult {
    std::string name;
    StepStatus status{StepStatus::skipped};
    std::string error_code;
};

enum class TestStatus {
    passed,
    failed,
    skipped,
};

struct TestReport {
    std::string test_case_id;
    TestStatus status{TestStatus::skipped};
    std::vector<StepResult> steps;
};

[[nodiscard]] TestReport make_report(const TestCase& test_case, std::vector<StepResult> steps);
[[nodiscard]] std::string_view to_string(TestStatus status) noexcept;

} // namespace iotps::core::testing
