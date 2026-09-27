#include "iotps/core/transport/tcp.hpp"
#include "iotps/core/codec/codec.hpp"
#include "iotps/core/debug.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <deque>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <thread>
#include <utility>

#ifdef _WIN32
#define NOMINMAX
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <arpa/inet.h>
#include <cerrno>
#include <fcntl.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

namespace iotps::core::transport {
namespace {
#ifdef _WIN32
using Socket = SOCKET;
constexpr Socket invalid_socket = INVALID_SOCKET;
void close_socket(Socket s) {
    closesocket(s);
}
int socket_error() {
    return WSAGetLastError();
}
bool pending(int e) {
    return e == WSAEWOULDBLOCK || e == WSAEINPROGRESS;
}
bool nonblocking(Socket s) {
    u_long mode = 1;
    return ioctlsocket(s, FIONBIO, &mode) == 0;
}
using SockLength = int;
#else
using Socket = int;
constexpr Socket invalid_socket = -1;
void close_socket(Socket s) {
    ::close(s);
}
int socket_error() {
    return errno;
}
bool pending(int e) {
    return e == EWOULDBLOCK || e == EAGAIN || e == EINPROGRESS;
}
bool nonblocking(Socket s) {
    return s < FD_SETSIZE && fcntl(s, F_SETFL, O_NONBLOCK) == 0;
}
using SockLength = socklen_t;
#endif
TransportResult fail(TransportErrorCode code, std::string detail) {
    return TransportError{.code = code, .path = "tcp", .detail = std::move(detail)};
}
std::string address_of(const sockaddr_storage& address) {
    std::array<char, INET6_ADDRSTRLEN> text{};
    if (address.ss_family == AF_INET) {
        const auto& v = reinterpret_cast<const sockaddr_in&>(address);
        inet_ntop(AF_INET, &v.sin_addr, text.data(), static_cast<SockLength>(text.size()));
        return std::string{text.data()} + ":" + std::to_string(ntohs(v.sin_port));
    }
    const auto& v = reinterpret_cast<const sockaddr_in6&>(address);
    inet_ntop(AF_INET6, &v.sin6_addr, text.data(), static_cast<SockLength>(text.size()));
    return "[" + std::string{text.data()} + "]:" + std::to_string(ntohs(v.sin6_port));
}
bool parse_address(const std::string& host, std::uint16_t port, sockaddr_storage& address,
                   SockLength& size) {
    auto& ipv4 = reinterpret_cast<sockaddr_in&>(address);
    if (inet_pton(AF_INET, host.c_str(), &ipv4.sin_addr) == 1) {
        ipv4.sin_family = AF_INET;
        ipv4.sin_port = htons(port);
        size = sizeof(ipv4);
        return true;
    }
    auto& ipv6 = reinterpret_cast<sockaddr_in6&>(address);
    if (inet_pton(AF_INET6, host.c_str(), &ipv6.sin6_addr) == 1) {
        ipv6.sin6_family = AF_INET6;
        ipv6.sin6_port = htons(port);
        size = sizeof(ipv6);
        return true;
    }
    return false;
}
} // namespace

struct TcpSession::Impl {
    struct Outgoing {
        ByteBuffer data;
        std::size_t offset{0};
    };
    struct Peer {
        Socket socket;
        TcpPeer info;
        bool closing{false};
        std::deque<Outgoing> outgoing;
        FrameAssembler framer;
    };
    mutable std::mutex mutex;
    std::jthread worker;
    TcpSnapshot status;
    std::vector<Peer> peers;
    std::deque<TcpRecord> records;
    std::size_t record_bytes{0};
    std::uint64_t next_record{0}, next_peer{0};
    bool runtime_ready{true};
    FrameRule framing;
    std::optional<schema::ProtocolSchema> bound_protocol;

    Impl() {
#ifdef _WIN32
        WSADATA data{};
        runtime_ready = WSAStartup(MAKEWORD(2, 2), &data) == 0;
#endif
    }
    ~Impl() {
        worker.request_stop();
        if (worker.joinable())
            worker.join();
#ifdef _WIN32
        if (runtime_ready)
            WSACleanup();
#endif
    }
    void record(std::string direction, const TcpPeer& peer, ByteBuffer data,
                std::string detail = {}, std::optional<TcpParse> parsed = std::nullopt) {
        const auto time = std::chrono::duration_cast<std::chrono::milliseconds>(
                              std::chrono::system_clock::now().time_since_epoch())
                              .count();
        record_bytes += data.size();
        if (parsed)
            for (const auto& field : parsed->fields)
                record_bytes += field.value.size();
        records.push_back({++next_record, time, std::move(direction), peer.id, peer.address,
                           std::move(data), std::move(detail), std::move(parsed)});
        while (records.size() > 1000 || record_bytes > 4 * 1024 * 1024) {
            record_bytes -= records.front().data.size();
            if (records.front().parsed)
                for (const auto& field : records.front().parsed->fields)
                    record_bytes -= field.value.size();
            records.pop_front();
            ++status.dropped;
        }
    }
    void error(std::string detail) {
        status.error = std::move(detail);
        ++status.statistics.errors;
        record("SYS", {0, status.host + ":" + std::to_string(status.port)}, {}, status.error);
    }
    void remove_peer(std::size_t i, std::string detail) {
        auto& peer = peers[i];
        if (const auto partial = peer.framer.discard("connection closed"))
            record("SYS", peer.info, {}, partial->error);
        for (const auto& item : peer.outgoing)
            status.queued_bytes -= item.data.size() - item.offset;
        record("SYS", peer.info, {}, std::move(detail));
        close_socket(peer.socket);
        peers.erase(peers.begin() + static_cast<std::ptrdiff_t>(i));
    }
    void run(std::stop_token stop, sockaddr_storage address, SockLength size, bool server) {
        Socket listener = invalid_socket;
        Socket connecting = invalid_socket;
        try {
            Socket sock = ::socket(address.ss_family, SOCK_STREAM, IPPROTO_TCP);
            if (sock == invalid_socket)
                throw std::runtime_error("socket failed: " + std::to_string(socket_error()));
            connecting = sock;
            if (!nonblocking(sock))
                throw std::runtime_error("cannot enable nonblocking socket");
            if (server) {
#ifdef _WIN32
                const BOOL exclusive = TRUE;
                if (setsockopt(sock, SOL_SOCKET, SO_EXCLUSIVEADDRUSE,
                               reinterpret_cast<const char*>(&exclusive), sizeof(exclusive)) != 0)
                    throw std::runtime_error("cannot reserve listener address");
#endif
                if (::bind(sock, reinterpret_cast<sockaddr*>(&address), size) != 0 ||
                    ::listen(sock, 16) != 0)
                    throw std::runtime_error("listen failed: " + std::to_string(socket_error()));
                listener = std::exchange(connecting, invalid_socket);
                std::lock_guard lock(mutex);
                status.state = TransportState::open;
                status.error.clear();
                record("SYS", {0, address_of(address)}, {}, "Listening");
            } else {
                const int result = ::connect(sock, reinterpret_cast<sockaddr*>(&address), size);
                if (result != 0 && !pending(socket_error()))
                    throw std::runtime_error("connect failed: " + std::to_string(socket_error()));
                const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
                while (result != 0 && !stop.stop_requested()) {
                    fd_set write, errors;
                    FD_ZERO(&write);
                    FD_ZERO(&errors);
                    FD_SET(sock, &write);
                    FD_SET(sock, &errors);
                    timeval wait{0, 100000};
                    const int ready =
                        select(static_cast<int>(sock + 1), nullptr, &write, &errors, &wait);
                    if (ready < 0)
                        throw std::runtime_error("connect select failed");
                    if (ready > 0) {
                        int code = 0;
                        SockLength len = sizeof(code);
                        if (getsockopt(sock, SOL_SOCKET, SO_ERROR, reinterpret_cast<char*>(&code),
                                       &len) != 0 ||
                            code != 0)
                            throw std::runtime_error("connect failed: " + std::to_string(code));
                        break;
                    }
                    if (std::chrono::steady_clock::now() >= deadline)
                        throw std::runtime_error("connect timeout (5s)");
                }
                if (!stop.stop_requested()) {
                    std::lock_guard lock(mutex);
                    peers.push_back({std::exchange(connecting, invalid_socket),
                                     {++next_peer, address_of(address)},
                                     false,
                                     {}});
                    peers.back().framer.configure(framing);
                    status.state = TransportState::open;
                    status.error.clear();
                    record("SYS", peers.back().info, {}, "Connected");
                }
            }
            while (!stop.stop_requested()) {
                fd_set read, write;
                FD_ZERO(&read);
                FD_ZERO(&write);
                Socket highest = 0;
                if (listener != invalid_socket) {
                    FD_SET(listener, &read);
                    highest = listener;
                }
                {
                    std::lock_guard lock(mutex);
                    for (std::size_t i = peers.size(); i-- > 0;)
                        if (peers[i].closing)
                            remove_peer(i, "Disconnected; unsent queue discarded");
                    if (!server && peers.empty())
                        break;
                    for (const auto& peer : peers) {
                        FD_SET(peer.socket, &read);
                        if (!peer.outgoing.empty())
                            FD_SET(peer.socket, &write);
                        highest = std::max(highest, peer.socket);
                    }
                }
                timeval wait{0, 100000};
                const int ready =
                    select(static_cast<int>(highest + 1), &read, &write, nullptr, &wait);
                if (ready < 0)
                    throw std::runtime_error("socket select failed: " +
                                             std::to_string(socket_error()));
                std::lock_guard lock(mutex);
                if (listener != invalid_socket && FD_ISSET(listener, &read)) {
                    sockaddr_storage remote{};
                    SockLength length = sizeof(remote);
                    Socket client = accept(listener, reinterpret_cast<sockaddr*>(&remote), &length);
                    if (client != invalid_socket) {
                        if (peers.size() >= 16 || !nonblocking(client)) {
                            close_socket(client);
                            error("Client limit (16) or socket setup failure");
                        } else {
                            peers.push_back({client, {++next_peer, address_of(remote)}, false, {}});
                            peers.back().framer.configure(framing);
                            record("SYS", peers.back().info, {}, "Client connected");
                        }
                    }
                }
                for (std::size_t i = peers.size(); i-- > 0;) {
                    auto& peer = peers[i];
                    if (const auto expired = peer.framer.expire(std::chrono::steady_clock::now()))
                        record("SYS", peer.info, {}, expired->error);
                    if (FD_ISSET(peer.socket, &read)) {
                        std::array<std::uint8_t, 16384> buffer{};
                        const int count = static_cast<int>(
                            recv(peer.socket, reinterpret_cast<char*>(buffer.data()),
                                 static_cast<int>(buffer.size()), 0));
                        if (count > 0) {
                            status.statistics.bytes_received += static_cast<std::uint64_t>(count);
                            ++status.statistics.messages_received;
                            record("RX", peer.info, {buffer.begin(), buffer.begin() + count});
                            for (auto& frame :
                                 peer.framer.feed({buffer.data(), static_cast<std::size_t>(count)},
                                                  std::chrono::steady_clock::now())) {
                                if (frame.error.empty()) {
                                    std::string detail = "Complete frame; no protocol bound";
                                    std::optional<TcpParse> parsed;
                                    if (bound_protocol) {
                                        detail = "Protocol " + status.protocol_path + ": ";
                                        std::string message = status.message_name;
                                        std::string reason;
                                        if (!status.message_name.empty()) {
                                            detail += "message " + status.message_name + " (fixed binding)";
                                        } else {
                                            const auto match =
                                                schema::identify_message(*bound_protocol, frame.bytes);
                                            if (match.status == schema::MatchStatus::matched)
                                                message = match.message;
                                            else
                                                reason = match.reason;
                                            detail += reason.empty() ? "message " + message : reason;
                                        }
                                        parsed.emplace();
                                        parsed->protocol_path = status.protocol_path;
                                        parsed->message_name = message;
                                        if (!reason.empty()) {
                                            parsed->status = "unmatched";
                                            parsed->error = reason;
                                        } else {
                                            const auto decoded = codec::decode_protocol_message(
                                                *bound_protocol, message, frame.bytes);
                                            const auto definition = std::ranges::find_if(
                                                bound_protocol->messages, [&](const auto& item) {
                                                    return item.name == message;
                                                });
                                            parsed->checksum = definition != bound_protocol->messages.end() &&
                                                                       definition->checksum
                                                                   ? ""
                                                                   : "none";
                                            if (const auto* error = decoded.error_if()) {
                                                parsed->status = "error";
                                                parsed->error = error->detail;
                                                if (error->detail.find("checksum_mismatch") !=
                                                    std::string::npos)
                                                    parsed->checksum = "fail";
                                            } else {
                                                parsed->status = "ok";
                                                if (definition->checksum)
                                                    parsed->checksum = "pass";
                                                const auto& data = decoded.value();
                                                for (const auto& field : data.message.fields) {
                                                    const auto field_definition = std::ranges::find_if(
                                                        definition->fields, [&](const auto& item) {
                                                            return item.name == field.name;
                                                        });
                                                    const auto range = std::ranges::find_if(
                                                        data.field_ranges, [&](const auto& item) {
                                                            return item.path == message + "." + field.name;
                                                        });
                                                    if (range == data.field_ranges.end())
                                                        continue;
                                                    auto value = format_scalar(field.value);
                                                    if (value.size() > 512) {
                                                        std::size_t end = 512;
                                                        while (end > 0 &&
                                                               (static_cast<unsigned char>(value[end]) &
                                                                0xc0) == 0x80)
                                                            --end;
                                                        value = value.substr(0, end) + "...";
                                                    }
                                                    std::optional<std::string> enum_name;
                                                    if (!field_definition->enum_values.empty())
                                                        enum_name = std::string{schema::enum_name(
                                                            *field_definition, value).value_or("")};
                                                    parsed->fields.push_back({
                                                        field.name, field_definition->display_name,
                                                        std::string{schema::to_string(field_definition->type)},
                                                        std::move(value), range->offset, range->length,
                                                        std::move(enum_name)});
                                                    if (const auto* raw = std::get_if<std::uint64_t>(&field.value)) {
                                                        auto& parsed_field = parsed->fields.back();
                                                        const auto order = field_definition->byte_order.value_or(
                                                            bound_protocol->protocol.default_byte_order);
                                                        for (const auto& bit : field_definition->bits) {
                                                            const auto low = bit.offset / 8;
                                                            const auto high = (bit.offset + bit.width - 1) / 8;
                                                            const auto first = order == schema::ByteOrder::little_endian
                                                                                   ? low : range->length - 1 - high;
                                                            parsed_field.bits.push_back({
                                                                bit.name, bit.display_name,
                                                                std::to_string(schema::bit_value(*raw, bit)),
                                                                range->offset + first, high - low + 1,
                                                                bit.offset, bit.width});
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    record("FRAME", peer.info, std::move(frame.bytes),
                                           std::move(detail), std::move(parsed));
                                } else
                                    record("SYS", peer.info, {}, std::move(frame.error));
                            }
                        } else if (count == 0 || !pending(socket_error())) {
                            if (count < 0)
                                error("receive failed: " + std::to_string(socket_error()));
                            remove_peer(i, "Peer disconnected; unsent queue discarded");
                            continue;
                        }
                    }
                    if (FD_ISSET(peer.socket, &write) && !peer.outgoing.empty()) {
                        auto& item = peer.outgoing.front();
#ifdef MSG_NOSIGNAL
                        constexpr int flags = MSG_NOSIGNAL;
#else
                        constexpr int flags = 0;
#endif
                        const int count = static_cast<int>(
                            ::send(peer.socket,
                                   reinterpret_cast<const char*>(item.data.data() + item.offset),
                                   static_cast<int>(item.data.size() - item.offset), flags));
                        if (count > 0) {
                            status.statistics.bytes_sent += static_cast<std::uint64_t>(count);
                            status.queued_bytes -= static_cast<std::size_t>(count);
                            record("TX", peer.info,
                                   {item.data.begin() + static_cast<std::ptrdiff_t>(item.offset),
                                    item.data.begin() +
                                        static_cast<std::ptrdiff_t>(
                                            item.offset + static_cast<std::size_t>(count))});
                            item.offset += static_cast<std::size_t>(count);
                            if (item.offset == item.data.size()) {
                                ++status.statistics.messages_sent;
                                peer.outgoing.pop_front();
                            }
                        } else if (count == 0 || !pending(socket_error())) {
                            error("send failed: " + std::to_string(socket_error()));
                            remove_peer(i, "Send failed; unsent queue discarded");
                        }
                    }
                }
            }
        } catch (const std::exception& e) {
            std::lock_guard lock(mutex);
            error(e.what());
            status.state = TransportState::faulted;
        }
        if (listener != invalid_socket)
            close_socket(listener);
        if (connecting != invalid_socket)
            close_socket(connecting);
        std::lock_guard lock(mutex);
        while (!peers.empty())
            remove_peer(peers.size() - 1, "Disconnected; unsent queue discarded");
        if (status.state != TransportState::faulted || stop.stop_requested())
            status.state = TransportState::closed;
        record("SYS", {0, status.host + ":" + std::to_string(status.port)}, {}, "Stopped");
    }
};

TcpSession::TcpSession() : impl_(std::make_unique<Impl>()) {}
TcpSession::~TcpSession() = default;
TransportResult TcpSession::start(bool server, std::string host, std::uint16_t port,
                                  std::uint32_t retry_limit, std::uint32_t retry_interval_ms) {
    sockaddr_storage address{};
    SockLength size = 0;
    if (!impl_->runtime_ready || port == 0 || host.size() > 64 || retry_limit > 10 ||
        retry_interval_ms < 1000 || retry_interval_ms > 60000 ||
        !parse_address(host, port, address, size))
        return fail(TransportErrorCode::invalid_configuration,
                    "Use an IPv4/IPv6 address and port 1-65535");
    {
        std::lock_guard lock(impl_->mutex);
        if (impl_->status.state == TransportState::open ||
            impl_->status.state == TransportState::opening)
            return fail(TransportErrorCode::already_open,
                        "Disconnect before changing the endpoint");
    }
    if (impl_->worker.joinable())
        impl_->worker.join();
    {
        std::lock_guard lock(impl_->mutex);
        impl_->status.state = TransportState::opening;
        impl_->status.server = server;
        impl_->status.host = std::move(host);
        impl_->status.port = port;
        impl_->status.error.clear();
        impl_->status.retries = 0;
    }
    try {
        impl_->worker = std::jthread([this, address, size, server, retry_limit,
                                      retry_interval_ms](std::stop_token token) {
            for (std::uint32_t attempt = 0;;) {
                impl_->run(token, address, size, server);
                if (token.stop_requested() || server || attempt == retry_limit)
                    break;
                {
                    std::lock_guard lock(impl_->mutex);
                    impl_->status.retries = ++attempt;
                    impl_->status.state = TransportState::opening;
                    impl_->record(
                        "SYS", {0, impl_->status.host + ":" + std::to_string(impl_->status.port)},
                        {},
                        "Reconnect attempt " + std::to_string(attempt) + "/" +
                            std::to_string(retry_limit));
                }
                const auto deadline =
                    std::chrono::steady_clock::now() + std::chrono::milliseconds(retry_interval_ms);
                while (!token.stop_requested() && std::chrono::steady_clock::now() < deadline)
                    std::this_thread::sleep_for(std::chrono::milliseconds(50));
            }
        });
    } catch (const std::exception& error) {
        std::lock_guard lock(impl_->mutex);
        impl_->status.state = TransportState::faulted;
        impl_->error(error.what());
        return fail(TransportErrorCode::open_failed, error.what());
    }
    return std::monostate{};
}
void TcpSession::stop() {
    impl_->worker.request_stop();
    if (impl_->worker.joinable())
        impl_->worker.join();
    std::lock_guard lock(impl_->mutex);
    impl_->status.state = TransportState::closed;
}
TransportResult TcpSession::send(std::uint64_t peer, std::span<const std::uint8_t> bytes) {
    std::lock_guard lock(impl_->mutex);
    if (bytes.empty() || bytes.size() > 65536)
        return fail(TransportErrorCode::invalid_configuration, "Send 1-65536 bytes");
    if (impl_->status.state != TransportState::open)
        return fail(TransportErrorCode::not_open, "TCP is not connected");
    auto found = std::ranges::find_if(
        impl_->peers, [peer](const auto& item) { return item.info.id == peer && !item.closing; });
    if (found == impl_->peers.end())
        return fail(TransportErrorCode::not_open, "Select a connected peer");
    if (impl_->status.queued_bytes + bytes.size() > 512 * 1024)
        return fail(TransportErrorCode::send_failed, "Send queue is full (512 KiB)");
    found->outgoing.push_back({{bytes.begin(), bytes.end()}, 0});
    impl_->status.queued_bytes += bytes.size();
    return std::monostate{};
}
TransportResult TcpSession::disconnect(std::uint64_t peer) {
    std::lock_guard lock(impl_->mutex);
    auto found = std::ranges::find_if(impl_->peers,
                                      [peer](const auto& item) { return item.info.id == peer; });
    if (found == impl_->peers.end())
        return fail(TransportErrorCode::not_open, "Peer no longer connected");
    found->closing = true;
    if (!impl_->status.server)
        impl_->worker.request_stop();
    return std::monostate{};
}
TransportResult TcpSession::set_framing(FrameRule rule) {
    if (const auto error = frame_rule_error(rule); !error.empty())
        return fail(TransportErrorCode::invalid_configuration, error);
    std::lock_guard lock(impl_->mutex);
    impl_->framing = std::move(rule);
    for (auto& peer : impl_->peers) {
        if (const auto partial = peer.framer.discard("framing rule changed"))
            impl_->record("SYS", peer.info, {}, partial->error);
        peer.framer.configure(impl_->framing);
    }
    return std::monostate{};
}
TransportResult TcpSession::bind_protocol(schema::ProtocolSchema protocol, std::string path,
                                          std::string message) {
    if (path.empty() || !schema::validate(protocol).ok())
        return fail(TransportErrorCode::invalid_configuration, "Invalid protocol binding");
    if (!message.empty() &&
        std::ranges::none_of(protocol.messages,
                             [&](const auto& item) { return item.name == message; }))
        return fail(TransportErrorCode::invalid_configuration, "Message is not in the protocol");
    std::lock_guard lock(impl_->mutex);
    impl_->bound_protocol = std::move(protocol);
    impl_->status.protocol_path = std::move(path);
    impl_->status.message_name = std::move(message);
    impl_->record("SYS", {0, impl_->status.host}, {},
                  "Bound protocol " + impl_->status.protocol_path +
                      (impl_->status.message_name.empty() ? " (auto message)"
                                                          : " / " + impl_->status.message_name));
    return std::monostate{};
}
void TcpSession::clear_binding() {
    std::lock_guard lock(impl_->mutex);
    impl_->bound_protocol.reset();
    impl_->status.protocol_path.clear();
    impl_->status.message_name.clear();
    impl_->record("SYS", {0, impl_->status.host}, {}, "Protocol binding cleared");
}
void TcpSession::clear_records() {
    std::lock_guard lock(impl_->mutex);
    impl_->records.clear();
    impl_->record_bytes = 0;
    impl_->status.dropped = 0;
}
TcpSnapshot TcpSession::snapshot(std::uint64_t after, std::size_t max_records,
                                 std::size_t max_bytes) const {
    std::lock_guard lock(impl_->mutex);
    auto result = impl_->status;
    for (const auto& peer : impl_->peers)
        if (!peer.closing)
            result.peers.push_back(peer.info);
    result.cursor = after;
    std::size_t bytes = 0;
    for (const auto& record : impl_->records)
        if (record.id > after) {
            std::size_t record_size = record.data.size();
            if (record.parsed)
                for (const auto& field : record.parsed->fields)
                    record_size += field.value.size();
            if (!result.records.empty() && bytes + record_size > max_bytes)
                break;
            bytes += record_size;
            result.records.push_back(record);
            result.cursor = record.id;
            if (result.records.size() >= max_records)
                break;
        }
    if (result.records.empty())
        result.cursor = impl_->next_record;
    return result;
}
} // namespace iotps::core::transport
