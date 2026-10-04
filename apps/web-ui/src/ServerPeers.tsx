import { Circle, Monitor, MoreVertical } from "react-feather";
import type { TcpRecord, TcpSnapshot } from "./bridge";
import type { Locale } from "./i18n";

export const clientLabel = (id: number) => `C${String(id).padStart(2, "0")}`;

export default function ServerPeers({
  peers,
  records,
  selected,
  listening,
  locale,
  redact,
  onSelect,
  onMenu,
}: {
  peers: TcpSnapshot["peers"];
  records: TcpRecord[];
  selected: string;
  listening: boolean;
  locale: Locale;
  redact: (text: string) => string;
  onSelect: (id: string) => void;
  onMenu: (peer: TcpSnapshot["peers"][number]) => void;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const retained = new Map<number, TcpRecord>();
  for (const record of records) if (record.peer > 0) retained.set(record.peer, record);
  const offline = [...retained.values()].filter(
    (record) => !peers.some((peer) => peer.id === record.peer),
  );
  return (
    <aside className="tcp-server-peers" aria-label={t("客户端列表", "Client list")}>
      <header className="tcp-panel-heading">
        <strong>
          {t("客户端列表", "Clients")} ({peers.length})
        </strong>
        <span className="tcp-peer-limit">{peers.length} / 16</span>
      </header>
      <div className="tcp-server-peer-scroll">
        {peers.map((peer) => (
          <div
            key={peer.id}
            className={`tcp-server-peer ${selected === String(peer.id) ? "selected" : ""}`}
          >
            <button
              type="button"
              className="tcp-peer-select"
              aria-pressed={selected === String(peer.id)}
              onClick={() => onSelect(String(peer.id))}
            >
              <Monitor size={19} />
              <span>
                <strong>{clientLabel(peer.id)}</strong>
                <code title={redact(peer.address)}>{redact(peer.address)}</code>
                <small className="tcp-success">
                  <Circle size={8} />
                  {t("已连接", "Connected")}
                </small>
              </span>
            </button>
            <button
              type="button"
              className="tcp-peer-more"
              aria-label={`${t("客户端操作", "Client actions")} ${clientLabel(peer.id)}`}
              onClick={() => onMenu(peer)}
            >
              <MoreVertical size={16} />
            </button>
          </div>
        ))}
        {!peers.length && (
          <div className="tcp-detail-empty">
            <Monitor size={28} />
            <strong>
              {listening
                ? t("等待客户端连接", "Waiting for clients")
                : t("暂无客户端", "No clients")}
            </strong>
            <p>
              {listening
                ? t("客户端接入后会显示在这里", "Clients appear here when connected")
                : t("开始监听后接收客户端连接", "Start listening to accept clients")}
            </p>
          </div>
        )}
        {offline.length > 0 && (
          <details className="tcp-offline-peers" open>
            <summary>
              {t("已断开", "Disconnected")} ({offline.length})
            </summary>
            {offline.map((record) => (
              <div className="tcp-offline-peer" key={record.peer}>
                <Circle size={9} />
                <span>
                  <strong>{clientLabel(record.peer)}</strong>
                  <code>{redact(record.address)}</code>
                  <small>
                    {t("最后记录", "Last record")}:{" "}
                    {new Date(record.time).toLocaleTimeString(locale, { hour12: false })}
                  </small>
                </span>
              </div>
            ))}
          </details>
        )}
      </div>
      <footer>
        {listening ? t("正在监听", "Listening") : t("监听未启动", "Listener stopped")} ·{" "}
        {t("已连接", "Connected")} {peers.length}
      </footer>
    </aside>
  );
}
