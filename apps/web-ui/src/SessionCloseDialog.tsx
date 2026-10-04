import { useEffect, useRef } from "react";
import { AlertTriangle } from "react-feather";
import type { Locale } from "./i18n";

export default function SessionCloseDialog({
  name,
  open,
  busy,
  error,
  locale,
  onCancel,
  onConfirm,
}: {
  name: string;
  open: boolean;
  busy: boolean;
  error: string;
  locale: Locale;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="protocol-dialog session-close-dialog"
      aria-label={t("关闭会话", "Close session")}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onCancel();
      }}
    >
      <header>
        <AlertTriangle size={28} />
        <div>
          <h2>{t("关闭会话", "Close session")}</h2>
          <p>
            {t("会话", "Session")}: {name}
          </p>
        </div>
      </header>
      <div className="session-close-copy">
        <p>
          {t(
            `将关闭会话 ${name}，并断开当前连接。`,
            `Close ${name} and disconnect its connection.`,
          )}
        </p>
        <p>
          {t(
            "本会话的发送队列、草稿和收发记录将被清除；已保存的记录文件不受影响。",
            "This session's queue, draft and traffic records will be cleared. Saved record files are kept.",
          )}
        </p>
        <p>
          {t(
            "正在进行的后续发送任务将停止，已发送数据不会撤回。",
            "Further sends will stop. Data already sent cannot be recalled.",
          )}
        </p>
      </div>
      {error && (
        <p role="alert" className="tcp-error">
          {error}
        </p>
      )}
      <footer>
        <button type="button" disabled={busy} onClick={onCancel}>
          {t("取消", "Cancel")}
        </button>
        <button type="button" className="session-close-confirm" disabled={busy} onClick={onConfirm}>
          {busy ? t("关闭中…", "Closing…") : t("关闭会话", "Close session")}
        </button>
      </footer>
    </dialog>
  );
}
