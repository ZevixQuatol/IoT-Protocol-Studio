import { Minus, Layout as PanelTop, Radio, Square, X } from "react-feather";
import type { Locale } from "./i18n";

const logo = new URL("/iot-protocol-studio.svg", document.baseURI).href;
export default function SessionToolbar({
  name,
  locale,
  onDock,
  onClose,
}: {
  name: string;
  locale: Locale;
  onDock: () => void;
  onClose: () => void;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const action = (element: HTMLElement, value: string) => {
    const owner = element.ownerDocument.defaultView as
      | (Window & {
          chrome?: { webview?: { postMessage: (message: string) => void } };
        })
      | null;
    owner?.chrome?.webview?.postMessage(`iotps-popup:${value}`);
  };
  return (
    <header
      className="tcp-popup-toolbar"
      onPointerDown={(event) => {
        if (event.button === 0 && !(event.target as Element).closest("button"))
          action(event.currentTarget, "drag");
      }}
      onDoubleClick={(event) => {
        if (!(event.target as Element).closest("button")) action(event.currentTarget, "maximize");
      }}
    >
      <img src={logo} alt="" width={25} height={25} />
      <Radio size={16} className="tcp-popup-symbol" />
      <strong>IoT Protocol Studio</strong>
      <span className="tcp-popup-name" title={name}>
        {name}
      </span>
      <button type="button" className="tcp-popup-dock" onClick={onDock}>
        <PanelTop size={16} />
        {t("合并回主窗口", "Dock to main window")}
      </button>
      <button
        type="button"
        aria-label={t("最小化", "Minimize")}
        onClick={(event) => action(event.currentTarget, "minimize")}
      >
        <Minus size={18} />
      </button>
      <button
        type="button"
        aria-label={t("最大化或还原", "Maximize or restore")}
        onClick={(event) => action(event.currentTarget, "maximize")}
      >
        <Square size={15} />
      </button>
      <button
        type="button"
        className="tcp-popup-close"
        aria-label={t("关闭会话", "Close session")}
        onClick={onClose}
      >
        <X size={19} />
      </button>
    </header>
  );
}
