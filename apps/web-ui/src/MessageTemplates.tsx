import { useEffect, useRef, useState } from "react";
import {
  messageTemplates,
  type MessageEncodeField,
  type MessageTemplate,
  type TemplateAction,
} from "./bridge";
import { messages, type Locale } from "./i18n";

export default function MessageTemplates({
  path,
  message,
  fields,
  busy,
  disabled,
  locale,
  onBusy,
  onLoad,
}: {
  path: string;
  message: string;
  fields: MessageEncodeField[];
  busy: boolean;
  disabled: boolean;
  locale: Locale;
  onBusy: (value: boolean) => void;
  onLoad: (fields: MessageEncodeField[]) => void;
}) {
  const t = messages[locale];
  const [items, setItems] = useState<MessageTemplate[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"replace" | "delete" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let active = true;
    void messageTemplates("list", path, message)
      .then((result) => {
        if (!active) return;
        if (result.ok) setItems(result.templates);
        else setError(`[${result.error.code}] ${result.error.message}`);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [path, message]);
  useEffect(() => {
    if (confirm) dialog.current?.showModal();
  }, [confirm]);
  const blocked = disabled || busy || loading;
  const run = async (action: TemplateAction) => {
    if (blocked) return;
    onBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await messageTemplates(
        action,
        path,
        message,
        action === "save" ? name.trim() : selected,
        action === "save" || action === "replace" ? fields : [],
      );
      if (!alive.current) return;
      if (!result.ok) {
        setError(
          result.error.code === "message_template_incompatible"
            ? t.messageStudio.incompatible
            : result.error.code === "message_template_conflict"
              ? t.messageStudio.templateConflict
              : `[${result.error.code}] ${result.error.message}`,
        );
        return;
      }
      if (action === "load") {
        onLoad(result.templates[0].fields);
        setNotice(t.messageStudio.templateLoaded);
      } else {
        setItems(result.templates);
        setSelected(action === "delete" ? "" : action === "save" ? name.trim() : selected);
        setNotice(
          action === "delete" ? t.messageStudio.templateDeleted : t.messageStudio.templateSaved,
        );
      }
      setConfirm(null);
      dialog.current?.close();
    } catch (reason) {
      if (alive.current) setError(String(reason));
    } finally {
      onBusy(false);
    }
  };
  const choice = items.find((item) => item.name === selected);
  return (
    <section className="message-templates" aria-label={t.messageStudio.templates}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run("save");
        }}
      >
        <label>
          {t.messageStudio.templateName}
          <input
            value={name}
            required
            maxLength={64}
            disabled={blocked}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" disabled={blocked || !name.trim()}>
          {t.messageStudio.saveTemplate}
        </button>
      </form>
      <div className="message-template-actions">
        <label>
          {t.messageStudio.templates}
          <select
            value={selected}
            disabled={blocked}
            onChange={(event) => {
              setSelected(event.target.value);
              setNotice("");
              setError("");
            }}
          >
            <option value="">{t.messageStudio.chooseTemplate}</option>
            {items.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
                {item.compatible ? "" : " ⚠"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={blocked || !choice?.compatible}
          onClick={() => void run("load")}
        >
          {t.messageStudio.loadTemplate}
        </button>
        <button
          type="button"
          disabled={blocked || !choice}
          onClick={() => {
            setError("");
            setConfirm("replace");
          }}
        >
          {t.messageStudio.replaceTemplate}
        </button>
        <button
          type="button"
          disabled={blocked || !choice}
          onClick={() => {
            setError("");
            setConfirm("delete");
          }}
        >
          {t.messageStudio.deleteTemplate}
        </button>
      </div>
      <p className="message-template-hint">
        {choice && !choice.compatible ? t.messageStudio.incompatible : t.messageStudio.templateHint}
      </p>
      {error && !confirm && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <dialog
        ref={dialog}
        className="protocol-dialog template-dialog"
        aria-labelledby="template-confirm-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        onClose={() => setConfirm(null)}
      >
        <h2 id="template-confirm-title">
          {confirm === "replace" ? t.messageStudio.replaceTemplate : t.messageStudio.deleteTemplate}
        </h2>
        <p>
          {t.messageStudio.confirmTemplate} <strong>{selected}</strong>
        </p>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={() => dialog.current?.close()}>
            {t.create.cancel}
          </button>
          <button
            type="button"
            className="primary"
            disabled={blocked}
            onClick={() => confirm && void run(confirm)}
          >
            {confirm === "replace"
              ? t.messageStudio.replaceTemplate
              : t.messageStudio.deleteTemplate}
          </button>
        </footer>
      </dialog>
    </section>
  );
}
