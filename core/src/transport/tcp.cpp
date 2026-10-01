#include "iotps/core/transport/tcp.hpp"

#include "iotps/core/codec/codec.hpp"
#include "iotps/core/debug.hpp"
#include "iotps/core/transport/capture.hpp"

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
// clang-format off: Windows networking headers require this order.
#include <winsock2.h>
#include <windows.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
// clang-format on
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
bool unreachable(int e) {
    return e == WSAECONNRESET || e == WSAECONNREFUSED;
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
bool unreachable(int e) {
    return e == ECONNREFUSED;
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
        FrameAssembler tx_framer;
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
    ip_mreq membership{};
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
                std::string detail = {}, std::optional<TcpParse> parsed = std::nullopt,
                std::string flow = {}) {
        const auto time = std::chrono::duration_cast<std::chrono::milliseconds>(
                              std::chrono::system_clock::now().time_since_epoch())
                              .count();
        record_bytes += data.size();
        if (parsed)
            for (const auto& field : parsed->fields)
                record_bytes += field.value.size();
        records.push_back({++next_record, time, std::move(direction), peer.id, peer.address,
                           std::move(data), std::move(detail), std::move(parsed), status.device,
                           std::move(flow)});
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
        if (const auto partial = peer.tx_framer.discard("connection closed"))
            record("SYS", peer.info, {}, "TX: " + partial->error);
        for (const auto& item : peer.outgoing)
            status.queued_bytes -= item.data.size() - item.offset;
        record("SYS", peer.info, {}, std::move(detail));
        if (peer.socket != invalid_socket)
            close_socket(peer.socket);
        peers.erase(peers.begin() + static_cast<std::ptrdiff_t>(i));
    }
    TransportResult prepare(std::string kind, std::string host, std::uint16_t port) {
        {
            std::lock_guard lock(mutex);
            if (status.state == TransportState::open || status.state == TransportState::opening)
                return fail(TransportErrorCode::already_open,
                            "Disconnect before changing parameters");
        }
        if (worker.joinable())
            worker.join();
        std::lock_guard lock(mutex);
        status.kind = std::move(kind);
        status.host = std::move(host);
        status.port = port;
        status.server = false;
        status.state = TransportState::opening;
        status.error.clear();
        status.retries = 0;
        membership = {};
        return std::monostate{};
    }
    void run_endpoint(std::stop_token stop, const SerialOptions* serial, const UdpOptions* udp) {
        Socket sock = invalid_socket;
#ifdef _WIN32
        HANDLE device = INVALID_HANDLE_VALUE;
#endif
        try {
            sockaddr_storage remote{};
            SockLength remote_size = 0;
            TcpPeer info{0, status.host};
            if (udp) {
                sockaddr_storage local{};
                SockLength local_size = 0;
                parse_address(udp->host, udp->port, local, local_size);
                parse_address(udp->remote_host, udp->remote_port, remote, remote_size);
                sock = ::socket(local.ss_family, SOCK_DGRAM, IPPROTO_UDP);
                if (sock == invalid_socket || !nonblocking(sock))
                    throw std::runtime_error("UDP socket setup failed: " +
                                             std::to_string(socket_error()));
                const int enabled = 1;
                if (udp->mode == "multicast") {
                    if (setsockopt(sock, SOL_SOCKET, SO_REUSEADDR,
                                   reinterpret_cast<const char*>(&enabled), sizeof(enabled)) != 0)
                        throw std::runtime_error("UDP address reuse failed");
                }
#ifdef _WIN32
                else if (setsockopt(sock, SOL_SOCKET, SO_EXCLUSIVEADDRUSE,
                                    reinterpret_cast<const char*>(&enabled), sizeof(enabled)) != 0)
                    throw std::runtime_error("UDP cannot reserve local endpoint");
#endif
                if (::bind(sock, reinterpret_cast<sockaddr*>(&local), local_size) != 0)
                    throw std::runtime_error("UDP bind failed: " + std::to_string(socket_error()));
                if (udp->mode == "broadcast" &&
                    setsockopt(sock, SOL_SOCKET, SO_BROADCAST,
                               reinterpret_cast<const char*>(&enabled), sizeof(enabled)) != 0)
                    throw std::runtime_error("UDP broadcast setup failed");
                if (udp->mode == "multicast") {
                    membership.imr_multiaddr = reinterpret_cast<sockaddr_in&>(remote).sin_addr;
                    inet_pton(AF_INET, udp->interface_address.c_str(), &membership.imr_interface);
                    const unsigned char ttl = 1;
                    if (setsockopt(sock, IPPROTO_IP, IP_MULTICAST_IF,
                                   reinterpret_cast<const char*>(&membership.imr_interface),
                                   sizeof(membership.imr_interface)) != 0 ||
                        setsockopt(sock, IPPROTO_IP, IP_MULTICAST_TTL,
                                   reinterpret_cast<const char*>(&ttl), sizeof(ttl)) != 0 ||
                        setsockopt(sock, IPPROTO_IP, IP_ADD_MEMBERSHIP,
                                   reinterpret_cast<const char*>(&membership),
                                   sizeof(membership)) != 0)
                        throw std::runtime_error("UDP multicast join failed: " +
                                                 std::to_string(socket_error()));
                }
                info.address = address_of(remote);
                SockLength length = sizeof(local);
                if (getsockname(sock, reinterpret_cast<sockaddr*>(&local), &length) != 0)
                    throw std::runtime_error("UDP cannot read local endpoint");
                std::lock_guard lock(mutex);
                status.port = local.ss_family == AF_INET
                                  ? ntohs(reinterpret_cast<sockaddr_in&>(local).sin_port)
                                  : ntohs(reinterpret_cast<sockaddr_in6&>(local).sin6_port);
                status.multicast_joined = udp->mode == "multicast";
            } else {
#ifdef _WIN32
                const auto path = "\\\\.\\" + serial->device;
                device = CreateFileA(path.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr,
                                     OPEN_EXISTING, 0, nullptr);
                if (device == INVALID_HANDLE_VALUE)
                    throw std::runtime_error(
                        "Serial open failed (occupied, absent or unplugged): " +
                        std::to_string(GetLastError()));
                DCB config{};
                config.DCBlength = sizeof(config);
                if (!GetCommState(device, &config))
                    throw std::runtime_error("Serial cannot read device parameters");
                config.BaudRate = serial->baud;
                config.ByteSize = serial->data_bits;
                config.Parity = serial->parity == "none"   ? NOPARITY
                                : serial->parity == "odd"  ? ODDPARITY
                                : serial->parity == "even" ? EVENPARITY
                                : serial->parity == "mark" ? MARKPARITY
                                                           : SPACEPARITY;
                config.StopBits = serial->stop_bits == "1"     ? ONESTOPBIT
                                  : serial->stop_bits == "1.5" ? ONE5STOPBITS
                                                               : TWOSTOPBITS;
                config.fBinary = TRUE;
                config.fParity = serial->parity != "none";
                config.fOutxCtsFlow = serial->flow_control == "hardware";
                config.fOutxDsrFlow = FALSE;
                config.fDsrSensitivity = FALSE;
                config.fRtsControl =
                    serial->flow_control == "hardware" ? RTS_CONTROL_HANDSHAKE : RTS_CONTROL_ENABLE;
                config.fDtrControl = DTR_CONTROL_ENABLE;
                config.fOutX = config.fInX = serial->flow_control == "software";
                config.fTXContinueOnXoff = FALSE;
                config.fErrorChar = config.fNull = config.fAbortOnError = FALSE;
                config.XonChar = 0x11;
                config.XoffChar = 0x13;
                COMMTIMEOUTS timeouts{};
                timeouts.ReadIntervalTimeout = MAXDWORD;
                timeouts.WriteTotalTimeoutConstant = 100;
                if (!SetCommState(device, &config) || !SetCommTimeouts(device, &timeouts) ||
                    !SetupComm(device, 65536, 65536))
                    throw std::runtime_error("Serial parameter setup failed: " +
                                             std::to_string(GetLastError()));
#else
                throw std::runtime_error("Serial transport currently requires Windows");
#endif
            }
            {
                std::lock_guard lock(mutex);
                info.id = ++next_peer;
                peers.push_back({sock, info, false, {}});
                sock = invalid_socket; // The peer owns the socket from here.
                peers.back().framer.configure(framing);
                peers.back().tx_framer.configure(framing);
                status.state = TransportState::open;
                record("SYS", info, {}, udp ? "UDP bound" : "Serial opened");
            }
            std::array<std::uint8_t, 65536> buffer{};
            while (!stop.stop_requested()) {
                if (serial)
                    std::this_thread::sleep_for(std::chrono::milliseconds(10));
                else {
                    fd_set read;
                    FD_ZERO(&read);
                    Socket current;
                    {
                        std::lock_guard lock(mutex);
                        current = peers.front().socket;
                    }
                    FD_SET(current, &read);
                    timeval wait{0, 10000};
                    if (select(static_cast<int>(current + 1), &read, nullptr, nullptr, &wait) < 0)
                        throw std::runtime_error("UDP select failed");
                }
                std::lock_guard lock(mutex);
                auto& peer = peers.front();
                if (peer.closing)
                    break;
                if (serial) {
#ifdef _WIN32
                    DWORD errors = 0, count = 0;
                    COMSTAT comm{};
                    if (!ClearCommError(device, &errors, &comm) ||
                        !ReadFile(device, buffer.data(), static_cast<DWORD>(buffer.size()), &count,
                                  nullptr))
                        throw std::runtime_error("Serial receive failed (device removed): " +
                                                 std::to_string(GetLastError()));
                    if (errors) {
                        error("Serial line error: " + std::to_string(errors));
                        if (const auto partial = peer.framer.discard("serial line error"))
                            record("SYS", info, {}, partial->error);
                    }
                    if (count) {
                        status.statistics.bytes_received += count;
                        ++status.statistics.messages_received;
                        record("RX", info, {buffer.begin(), buffer.begin() + count});
                        for (auto& frame : peer.framer.feed({buffer.data(), errors ? 0u : count},
                                                            std::chrono::steady_clock::now()))
                            if (frame.error.empty())
                                complete_frame(info, std::move(frame.bytes));
                            else
                                record("SYS", info, {}, std::move(frame.error));
                    }
                    if (const auto expired = peer.framer.expire(std::chrono::steady_clock::now()))
                        record("SYS", info, {}, expired->error);
#endif
                    if (const auto expired =
                            peer.tx_framer.expire(std::chrono::steady_clock::now()))
                        record("SYS", info, {}, "TX: " + expired->error);
                } else {
                    sockaddr_storage source{};
                    SockLength source_size = sizeof(source);
                    const int count = static_cast<int>(
                        recvfrom(peer.socket, reinterpret_cast<char*>(buffer.data()),
                                 static_cast<int>(buffer.size()), 0,
                                 reinterpret_cast<sockaddr*>(&source), &source_size));
                    if (count >= 0) {
                        status.statistics.bytes_received += static_cast<std::uint64_t>(count);
                        ++status.statistics.messages_received;
                        const TcpPeer sender{0, address_of(source)};
                        record("RX", sender, {buffer.begin(), buffer.begin() + count},
                               "UDP datagram");
                        complete_frame(sender, {buffer.begin(), buffer.begin() + count});
                    } else {
                        const auto code = socket_error();
                        if (unreachable(code))
                            error("UDP remote unreachable: " + std::to_string(code));
                        else if (!pending(code))
                            throw std::runtime_error("UDP receive failed: " + std::to_string(code));
                    }
                }
                if (!peer.outgoing.empty()) {
                    auto& item = peer.outgoing.front();
                    int count = -1;
                    if (serial) {
#ifdef _WIN32
                        DWORD written = 0;
                        if (!WriteFile(device, item.data.data() + item.offset,
                                       static_cast<DWORD>(item.data.size() - item.offset), &written,
                                       nullptr) ||
                            !written)
                            throw std::runtime_error("Serial send failed or timed out: " +
                                                     std::to_string(GetLastError()));
                        count = static_cast<int>(written);
#endif
                    } else {
                        count = static_cast<int>(
                            sendto(peer.socket, reinterpret_cast<const char*>(item.data.data()),
                                   static_cast<int>(item.data.size()), 0,
                                   reinterpret_cast<sockaddr*>(&remote), remote_size));
                        if (count < 0 && pending(socket_error()))
                            continue;
                        if (count < 0 || static_cast<std::size_t>(count) != item.data.size())
                            throw std::runtime_error("UDP send failed: " +
                                                     std::to_string(socket_error()));
                    }
                    status.statistics.bytes_sent += static_cast<std::uint64_t>(count);
                    status.queued_bytes -= static_cast<std::size_t>(count);
                    record("TX", info,
                           {item.data.begin() + static_cast<std::ptrdiff_t>(item.offset),
                            item.data.begin() + static_cast<std::ptrdiff_t>(item.offset + count)});
                    sent_frames(peer,
                                {item.data.data() + item.offset, static_cast<std::size_t>(count)},
                                udp != nullptr);
                    item.offset += static_cast<std::size_t>(count);
                    if (item.offset == item.data.size()) {
                        ++status.statistics.messages_sent;
                        peer.outgoing.pop_front();
                    }
                }
            }
        } catch (const std::exception& e) {
            std::lock_guard lock(mutex);
            error(e.what());
            status.state = TransportState::faulted;
        }
#ifdef _WIN32
        if (device != INVALID_HANDLE_VALUE)
            CloseHandle(device);
#endif
        if (sock != invalid_socket)
            close_socket(sock);
        std::lock_guard lock(mutex);
        if (status.multicast_joined && !peers.empty())
            setsockopt(peers.front().socket, IPPROTO_IP, IP_DROP_MEMBERSHIP,
                       reinterpret_cast<const char*>(&membership), sizeof(membership));
        status.multicast_joined = false;
        while (!peers.empty())
            remove_peer(peers.size() - 1, "Disconnected; unsent queue discarded");
        if (status.state != TransportState::faulted || stop.stop_requested())
            status.state = TransportState::closed;
        record("SYS", {0, status.host}, {}, "Stopped");
    }
    void sent_frames(Peer& peer, std::span<const std::uint8_t> bytes, bool udp = false) {
        if (udp) {
            // UDP uses the actual remote endpoint, like RX's source, rather than the socket ID.
            complete_frame({0, peer.info.address}, {bytes.begin(), bytes.end()}, "TX");
            return;
        }
        for (auto& frame : peer.tx_framer.feed(bytes, std::chrono::steady_clock::now()))
            if (frame.error.empty())
                complete_frame(peer.info, std::move(frame.bytes), "TX");
            else
                record("SYS", peer.info, {}, "TX: " + frame.error);
    }
    void complete_frame(const TcpPeer& info, ByteBuffer bytes, std::string flow = "RX") {
        auto parsed = parse_frame(bound_protocol ? &*bound_protocol : nullptr, status.protocol_path,
                                  status.message_name, bytes);
        const auto detail =
            parsed ? "Protocol " + parsed->protocol_path + ": " +
                         (parsed->error.empty() ? "message " + parsed->message_name : parsed->error)
                   : "Complete frame; no protocol bound";
        record("FRAME", info, std::move(bytes), detail, std::move(parsed), std::move(flow));
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
                    peers.back().tx_framer.configure(framing);
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
                            peers.back().tx_framer.configure(framing);
                            record("SYS", peers.back().info, {}, "Client connected");
                        }
                    }
                }
                for (std::size_t i = peers.size(); i-- > 0;) {
                    auto& peer = peers[i];
                    if (const auto expired = peer.framer.expire(std::chrono::steady_clock::now()))
                        record("SYS", peer.info, {}, expired->error);
                    if (const auto expired =
                            peer.tx_framer.expire(std::chrono::steady_clock::now()))
                        record("SYS", peer.info, {}, "TX: " + expired->error);
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
                                    complete_frame(peer.info, std::move(frame.bytes));
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
                            sent_frames(peer, {item.data.data() + item.offset -
                                                   static_cast<std::size_t>(count),
                                               static_cast<std::size_t>(count)});
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
TransportResult TcpSession::set_device(std::string identifier) {
    if (identifier.size() > 512 ||
        std::ranges::any_of(identifier, [](unsigned char c) { return c < 32 || c == 127; }))
        return fail(TransportErrorCode::invalid_configuration,
                    "Device identifier exceeds 512 bytes or contains control characters");
    std::lock_guard lock(impl_->mutex);
    impl_->status.device = std::move(identifier);
    return std::monostate{};
}
std::vector<std::string> serial_devices() {
    std::vector<std::string> result;
#ifdef _WIN32
    std::array<char, 4096> target{};
    for (int i = 1; i <= 999; ++i) {
        const auto name = "COM" + std::to_string(i);
        if (QueryDosDeviceA(name.c_str(), target.data(), static_cast<DWORD>(target.size())))
            result.push_back(name);
    }
#endif
    return result;
}
std::vector<std::string> network_interfaces() {
    std::vector<std::string> result{"0.0.0.0"};
#ifdef _WIN32
    ULONG size = 16384;
    std::vector<unsigned char> buffer(size);
    ULONG code = ERROR_BUFFER_OVERFLOW;
    for (int attempt = 0; attempt < 3; ++attempt) {
        code = GetAdaptersAddresses(
            AF_INET, GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER,
            nullptr, reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buffer.data()), &size);
        if (code != ERROR_BUFFER_OVERFLOW)
            break;
        buffer.resize(size);
    }
    if (code == NO_ERROR)
        for (auto* adapter = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buffer.data()); adapter;
             adapter = adapter->Next)
            if (adapter->OperStatus == IfOperStatusUp)
                for (auto* item = adapter->FirstUnicastAddress; item; item = item->Next) {
                    if (item->Address.lpSockaddr->sa_family != AF_INET)
                        continue;
                    std::array<char, INET_ADDRSTRLEN> text{};
                    inet_ntop(AF_INET,
                              &reinterpret_cast<sockaddr_in*>(item->Address.lpSockaddr)->sin_addr,
                              text.data(), static_cast<SockLength>(text.size()));
                    result.emplace_back(text.data());
                }
#endif
    std::ranges::sort(result);
    result.erase(std::unique(result.begin(), result.end()), result.end());
    return result;
}
TransportResult TcpSession::start_serial(SerialOptions options) {
    const auto& device = options.device;
    if (device.size() < 4 || device.size() > 6 || device.substr(0, 3) != "COM" || device[3] < '1' ||
        device[3] > '9' ||
        !std::ranges::all_of(device.begin() + 3, device.end(),
                             [](char c) { return c >= '0' && c <= '9'; }) ||
        options.baud < 50 || options.baud > 4000000 || options.data_bits < 5 ||
        options.data_bits > 8 ||
        (options.parity != "none" && options.parity != "odd" && options.parity != "even" &&
         options.parity != "mark" && options.parity != "space") ||
        (options.stop_bits != "1" && options.stop_bits != "1.5" && options.stop_bits != "2") ||
        (options.stop_bits == "1.5" && options.data_bits != 5) ||
        (options.stop_bits == "2" && options.data_bits == 5) ||
        (options.flow_control != "none" && options.flow_control != "hardware" &&
         options.flow_control != "software"))
        return fail(TransportErrorCode::invalid_configuration,
                    "Invalid serial device or parameters (1.5 stop bits requires 5 data bits)");
    const auto prepared = impl_->prepare("serial", options.device, 0);
    if (!prepared.has_value())
        return prepared;
    try {
        impl_->worker = std::jthread([this, options = std::move(options)](std::stop_token token) {
            impl_->run_endpoint(token, &options, nullptr);
        });
    } catch (const std::exception& error) {
        std::lock_guard lock(impl_->mutex);
        impl_->status.state = TransportState::faulted;
        impl_->error(error.what());
        return fail(TransportErrorCode::open_failed, error.what());
    }
    return std::monostate{};
}
TransportResult TcpSession::start_udp(UdpOptions options) {
    sockaddr_storage local{}, remote{};
    SockLength local_size = 0, remote_size = 0;
    in_addr interface_address{};
    if (!impl_->runtime_ready || options.host.size() > 64 || options.remote_host.size() > 64 ||
        options.interface_address.size() > 64 || options.remote_port == 0 ||
        !parse_address(options.host, options.port, local, local_size) ||
        !parse_address(options.remote_host, options.remote_port, remote, remote_size) ||
        local.ss_family != remote.ss_family ||
        (options.mode != "unicast" && options.mode != "broadcast" && options.mode != "multicast") ||
        (options.mode != "unicast" && local.ss_family != AF_INET) ||
        inet_pton(AF_INET, options.interface_address.c_str(), &interface_address) != 1)
        return fail(TransportErrorCode::invalid_configuration,
                    "Invalid UDP addresses, address families, mode or ports");
    if (remote.ss_family == AF_INET) {
        const auto host = ntohl(reinterpret_cast<sockaddr_in&>(remote).sin_addr.s_addr);
        const bool multicast = (host & 0xf0000000u) == 0xe0000000u;
        if (multicast != (options.mode == "multicast") || host == 0 ||
            (options.mode == "unicast" && host == 0xffffffffu))
            return fail(TransportErrorCode::invalid_configuration,
                        "Multicast requires an IPv4 group in 224.0.0.0-239.255.255.255; broadcast "
                        "requires broadcast mode");
    } else if (IN6_IS_ADDR_MULTICAST(&reinterpret_cast<sockaddr_in6&>(remote).sin6_addr) ||
               IN6_IS_ADDR_UNSPECIFIED(&reinterpret_cast<sockaddr_in6&>(remote).sin6_addr)) {
        return fail(TransportErrorCode::invalid_configuration, "Use an IPv6 unicast target");
    }
    const auto prepared = impl_->prepare("udp", options.host, options.port);
    if (!prepared.has_value())
        return prepared;
    try {
        impl_->worker = std::jthread([this, options = std::move(options)](std::stop_token token) {
            impl_->run_endpoint(token, nullptr, &options);
        });
    } catch (const std::exception& error) {
        std::lock_guard lock(impl_->mutex);
        impl_->status.state = TransportState::faulted;
        impl_->error(error.what());
        return fail(TransportErrorCode::open_failed, error.what());
    }
    return std::monostate{};
}
TransportResult TcpSession::multicast_membership(bool join) {
    std::lock_guard lock(impl_->mutex);
    if (impl_->status.kind != "udp" || impl_->status.state != TransportState::open ||
        impl_->peers.empty() || impl_->membership.imr_multiaddr.s_addr == 0)
        return fail(TransportErrorCode::not_open, "Open a multicast session first");
    if (impl_->status.multicast_joined == join)
        return std::monostate{};
    if (setsockopt(
            impl_->peers.front().socket, IPPROTO_IP, join ? IP_ADD_MEMBERSHIP : IP_DROP_MEMBERSHIP,
            reinterpret_cast<const char*>(&impl_->membership), sizeof(impl_->membership)) != 0)
        return fail(TransportErrorCode::open_failed,
                    "Multicast membership failed: " + std::to_string(socket_error()));
    impl_->status.multicast_joined = join;
    impl_->record("SYS", impl_->peers.front().info, {},
                  join ? "Multicast joined" : "Multicast left");
    return std::monostate{};
}
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
        impl_->status.kind = "tcp";
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
    if (bytes.empty() || bytes.size() > (impl_->status.kind == "udp" ? 65507u : 65536u))
        return fail(TransportErrorCode::invalid_configuration, "Send 1-65536 bytes (UDP: 1-65507)");
    if (impl_->status.state != TransportState::open)
        return fail(TransportErrorCode::not_open, "Communication endpoint is not open");
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
CaptureResult TcpSession::import_capture(std::span<const std::uint8_t> file,
                                         const std::string& local_ipv4) const {
    FrameRule rule;
    std::optional<schema::ProtocolSchema> protocol;
    std::string path, message;
    {
        std::lock_guard lock(impl_->mutex);
        rule = impl_->framing;
        protocol = impl_->bound_protocol;
        path = impl_->status.protocol_path;
        message = impl_->status.message_name;
    }
    return import_pcap(file, local_ipv4, rule, protocol ? &*protocol : nullptr, path, message);
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
        if (const auto partial = peer.tx_framer.discard("framing rule changed"))
            impl_->record("SYS", peer.info, {}, "TX: " + partial->error);
        peer.tx_framer.configure(impl_->framing);
    }
    return std::monostate{};
}
TransportResult TcpSession::bind_protocol(schema::ProtocolSchema protocol, std::string path,
                                          std::string message) {
    if (path.empty() || !schema::validate(protocol).ok())
        return fail(TransportErrorCode::invalid_configuration, "Invalid protocol binding");
    if (!message.empty() && std::ranges::none_of(protocol.messages, [&](const auto& item) {
            return item.name == message;
        }))
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
