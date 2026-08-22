#pragma once

#include <cstddef>
#include <optional>
#include <string>
#include <type_traits>
#include <utility>
#include <variant>

namespace iotps::core {

struct SourceLocation {
    std::string source;
    std::size_t line;
    std::size_t column;

    friend bool operator==(const SourceLocation&, const SourceLocation&) = default;
};

template <typename Code> struct Error {
    Code code;
    std::string path;
    std::optional<std::size_t> offset;
    std::string detail;
    std::optional<SourceLocation> source_location;

    friend bool operator==(const Error&, const Error&) = default;
};

template <typename Value, typename ErrorType> class [[nodiscard]] Result final {
    static_assert(!std::is_same_v<Value, ErrorType>,
                  "Result value and error types must be different");

  public:
    Result(const Value& value) : storage_(value) {}
    Result(Value&& value) : storage_(std::move(value)) {}
    Result(const ErrorType& error) : storage_(error) {}
    Result(ErrorType&& error) : storage_(std::move(error)) {}

    [[nodiscard]] bool has_value() const noexcept {
        return std::holds_alternative<Value>(storage_);
    }

    [[nodiscard]] explicit operator bool() const noexcept {
        return has_value();
    }

    [[nodiscard]] Value& value() & {
        return std::get<Value>(storage_);
    }
    [[nodiscard]] const Value& value() const& {
        return std::get<Value>(storage_);
    }
    [[nodiscard]] Value&& value() && {
        return std::get<Value>(std::move(storage_));
    }

    [[nodiscard]] ErrorType& error() & {
        return std::get<ErrorType>(storage_);
    }
    [[nodiscard]] const ErrorType& error() const& {
        return std::get<ErrorType>(storage_);
    }
    [[nodiscard]] ErrorType&& error() && {
        return std::get<ErrorType>(std::move(storage_));
    }

    [[nodiscard]] Value* value_if() noexcept {
        return std::get_if<Value>(&storage_);
    }
    [[nodiscard]] const Value* value_if() const noexcept {
        return std::get_if<Value>(&storage_);
    }
    [[nodiscard]] ErrorType* error_if() noexcept {
        return std::get_if<ErrorType>(&storage_);
    }
    [[nodiscard]] const ErrorType* error_if() const noexcept {
        return std::get_if<ErrorType>(&storage_);
    }

  private:
    std::variant<Value, ErrorType> storage_;
};

template <typename ErrorType> using Status = Result<std::monostate, ErrorType>;

} // namespace iotps::core
