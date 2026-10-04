import { RefreshCw } from "react-feather";
import type { Locale } from "./i18n";

export default function UdpConnection({
  locale,
  session,
  mode,
  localHost,
  localPort,
  host,
  port,
  adapter,
  interfaces,
  disabled,
  connected,
  joined,
  busy,
  onMode,
  onLocalHost,
  onLocalPort,
  onHost,
  onPort,
  onAdapter,
  onRefresh,
  onMembership,
}: {
  locale: Locale;
  session: string;
  mode: string;
  localHost: string;
  localPort: string;
  host: string;
  port: string;
  adapter: string;
  interfaces: string[];
  disabled: boolean;
  connected: boolean;
  joined: boolean;
  busy: boolean;
  onMode: (value: string) => void;
  onLocalHost: (value: string) => void;
  onLocalPort: (value: string) => void;
  onHost: (value: string) => void;
  onPort: (value: string) => void;
  onAdapter: (value: string) => void;
  onRefresh: () => void;
  onMembership: () => void;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  return (
    <div className="udp-connection-fields">
      <div className="udp-modes" role="radiogroup" aria-label={t("UDP 模式", "UDP mode")}>
        {[
          ["unicast", t("单播", "Unicast")],
          ["broadcast", t("广播", "Broadcast")],
          ["multicast", t("IPv4 组播", "IPv4 multicast")],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            disabled={disabled}
            onClick={() => onMode(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <label>
        {t("本地地址", "Local address")}
        <input
          aria-label={t("本地 IP", "Local IP")}
          list={`udp-interfaces-${session}`}
          required
          maxLength={64}
          value={localHost}
          disabled={disabled}
          onChange={(event) => onLocalHost(event.target.value)}
        />
      </label>
      <datalist id={`udp-interfaces-${session}`}>
        {interfaces.map((address) => (
          <option key={address} value={address} />
        ))}
      </datalist>
      <label className="udp-port">
        {t("本地端口", "Local port")}
        <input
          aria-label={t("本地端口", "Local port")}
          title={t("0 表示自动分配端口", "0 allocates a port automatically")}
          inputMode="numeric"
          required
          value={localPort}
          disabled={disabled}
          onChange={(event) => onLocalPort(event.target.value)}
        />
      </label>
      <label className="udp-remote">
        {mode === "broadcast"
          ? t("广播地址", "Broadcast address")
          : mode === "multicast"
            ? t("组播地址", "Group address")
            : t("目标地址", "Remote address")}
        <input
          aria-label="IP"
          required
          maxLength={64}
          value={host}
          disabled={disabled}
          onChange={(event) => onHost(event.target.value)}
        />
      </label>
      <label className="udp-port">
        {t("目标端口", "Remote port")}
        <input
          aria-label={t("端口", "Port")}
          inputMode="numeric"
          required
          value={port}
          disabled={disabled}
          onChange={(event) => onPort(event.target.value)}
        />
      </label>
      {mode === "multicast" && (
        <div className="udp-membership">
          <label>
            {t("网卡", "Interface")}
            <select
              aria-label={t("组播网卡 IP", "Multicast interface IP")}
              value={adapter}
              disabled={disabled}
              onChange={(event) => onAdapter(event.target.value)}
            >
              {interfaces.map((address) => (
                <option key={address} value={address}>
                  {address === "0.0.0.0" ? t("系统默认", "System default") : address}
                </option>
              ))}
            </select>
          </label>
          <span className={`udp-membership-state ${joined ? "joined" : ""}`} role="status">
            {joined ? t("已加入组播", "Group joined") : t("未加入组播", "Group not joined")}
          </span>
          <button type="button" disabled={!connected || busy || joined} onClick={onMembership}>
            {t("加入组播", "Join group")}
          </button>
          <button type="button" disabled={!connected || busy || !joined} onClick={onMembership}>
            {t("退出组播", "Leave group")}
          </button>
        </div>
      )}
      <button
        className="udp-refresh"
        type="button"
        disabled={disabled}
        onClick={onRefresh}
        aria-label={t("刷新网卡", "Refresh interfaces")}
        title={t("刷新网卡", "Refresh interfaces")}
      >
        <RefreshCw size={14} />
      </button>
    </div>
  );
}
