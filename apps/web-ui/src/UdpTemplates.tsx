import { useEffect, useRef, useState } from "react";
import {
  encodeProtocolMessage,
  messageTemplates,
  type MessageEncodeRequest,
  type WorkspaceProtocol,
} from "./bridge";
import type { Locale } from "./i18n";

type Template = { message: string; name: string };
export default function UdpTemplates({
  protocol,
  locale,
  input,
  onLoad,
  onError,
}: {
  protocol: WorkspaceProtocol | undefined;
  locale: Locale;
  input: string;
  onLoad: (message: MessageEncodeRequest, hex: string) => void;
  onError: (error: string) => void;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const [items, setItems] = useState<Template[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const version = useRef(0);
  const loadedHex = useRef("");
  useEffect(() => {
    let alive = true;
    ++version.current;
    setItems([]);
    setSelected("");
    setLoading(false);
    if (!protocol) return;
    void Promise.all(
      protocol.schema.messages.map(async (message) => {
        const result = await messageTemplates("list", protocol.path, message.name);
        if (!result.ok) throw new Error(result.error.message);
        return result.templates
          .filter((item) => item.compatible)
          .map((item) => ({ message: message.name, name: item.name }));
      }),
    )
      .then((result) => {
        if (alive) setItems(result.flat());
      })
      .catch((error) => {
        if (alive) onError(String(error));
      });
    return () => {
      alive = false;
      ++version.current;
    };
  }, [protocol?.path]);
  useEffect(() => {
    if (input && input === loadedHex.current) return;
    loadedHex.current = "";
    ++version.current;
    setSelected("");
    setLoading(false);
  }, [input]);
  const load = async (value: string) => {
    const current = ++version.current;
    setSelected(value);
    if (!value || !protocol) {
      setLoading(false);
      return;
    }
    const item = items[Number(value) - 1];
    if (!item) return;
    setLoading(true);
    try {
      const result = await messageTemplates("load", protocol.path, item.message, item.name);
      if (version.current !== current) return;
      if (!result.ok) throw new Error(result.error.message);
      const template = result.templates.find(
        (entry) => entry.name === item.name && entry.compatible,
      );
      if (!template)
        throw new Error(t("模板已不存在或与协议不兼容", "Template missing or incompatible"));
      const message = {
        relativePath: protocol.path,
        messageName: item.message,
        fields: template.fields,
      };
      const encoded = await encodeProtocolMessage(message);
      if (version.current !== current) return;
      if (!encoded.ok) throw new Error(encoded.error.message);
      loadedHex.current = encoded.normalizedHex;
      onLoad(message, encoded.normalizedHex);
    } catch (error) {
      if (version.current === current) {
        setSelected("");
        onError(String(error));
      }
    } finally {
      if (version.current === current) setLoading(false);
    }
  };
  return (
    <label className="udp-template">
      {t("消息模板", "Message template")}
      <select
        aria-label={t("消息模板", "Message template")}
        value={selected}
        disabled={!protocol || loading}
        onChange={(event) => void load(event.target.value)}
        title={t(
          "使用报文工作台中已保存的兼容模板",
          "Use compatible templates saved in the Message workbench",
        )}
      >
        <option value="">
          {loading ? t("加载中…", "Loading…") : t("手动输入 / 当前报文", "Manual / current packet")}
        </option>
        {items.map((item, index) => (
          <option key={`${item.message}/${item.name}`} value={index + 1}>
            {item.name} · {item.message}
          </option>
        ))}
      </select>
    </label>
  );
}
