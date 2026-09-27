import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  SchemaEditAction,
  SchemaEditRequest,
  WorkspaceField,
  WorkspaceMessage,
} from "./bridge";
import { messages, type Locale } from "./i18n";

export type SchemaEditTarget = {
  action: SchemaEditAction;
  message?: WorkspaceMessage;
  field?: WorkspaceField;
};

const primitiveTypes = [
  "bool",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "float32",
  "float64",
];

export default function SchemaEditor({
  target,
  protocolPath,
  locale,
  busy,
  error,
  onSave,
  onClose,
}: {
  target: SchemaEditTarget;
  protocolPath: string;
  locale: Locale;
  busy: boolean;
  error?: string;
  onSave: (request: SchemaEditRequest) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = messages[locale];
  const { action, message, field } = target;
  const deleting = action.startsWith("delete");
  const isField = action.endsWith("Field");
  const [values, setValues] = useState<Record<string, string>>((): Record<string, string> =>
    isField
      ? {
          name: field?.name ?? "",
          displayName: field?.displayName ?? "",
          type: field?.type ?? "uint8",
          endian: field && !field.byteOrderInherited ? field.byteOrder : "",
          offset: field?.declaredOffset ?? "",
          length: field?.declaredLength ?? "",
          lengthOf: field?.lengthOf ?? "",
          elementType: field?.elementType ?? "uint8",
          count: field?.count ?? "1",
          enum: (field?.enumValues ?? []).map((item) => `${item.name}=${item.value}`).join("\n"),
          bits: (field?.bits ?? [])
            .map(
              (bit) =>
                `${bit.name}=${bit.offset}:${bit.width}${bit.displayName ? `:${bit.displayName}` : ""}`,
            )
            .join("\n"),
        }
      : {
          name: message?.name ?? "",
          displayName: message?.displayName ?? "",
          typeId: message?.typeId ?? "",
        },
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const update = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const text = (
    key: string,
    label: string,
    required = false,
    numeric = false,
    placeholder = "",
  ) => (
    <label key={key}>
      {label}
      <input
        name={key}
        value={values[key]}
        required={required}
        disabled={busy}
        autoFocus={key === "name"}
        maxLength={key === "displayName" ? 200 : 100}
        inputMode={numeric ? "numeric" : "text"}
        pattern={numeric ? "[0-9]+" : undefined}
        placeholder={placeholder}
        onChange={(event) => update(key, event.target.value)}
      />
    </label>
  );
  const titles: Partial<Record<SchemaEditAction, string>> = {
    addMessage: t.structure.addMessage,
    updateMessage: t.structure.editMessage,
    deleteMessage: t.structure.deleteMessage,
    addField: t.structure.addField,
    updateField: t.structure.editField,
    deleteField: t.structure.deleteField,
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const properties: Record<string, string> = deleting
      ? {}
      : { ...values, name: values.name.trim() };
    if (isField && !deleting) {
      if (values.type === "array") properties.length = "";
      else {
        properties.elementType = "";
        properties.count = "";
      }
      if (!["uint8", "uint16", "uint32", "uint64"].includes(values.type)) properties.lengthOf = "";
      if (!/^u?int(8|16|32|64)$/.test(values.type)) properties.enum = "";
      if (!/^uint(8|16|32|64)$/.test(values.type)) properties.bits = "";
    }
    if (
      await onSave({
        relativePath: protocolPath,
        action,
        messageName: message?.name ?? "",
        fieldName: field?.name ?? "",
        properties,
      })
    )
      onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="protocol-dialog schema-edit-dialog"
      aria-labelledby="schema-edit-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)}>
        <h2 id="schema-edit-title">{titles[action]}</h2>
        {deleting ? (
          <p>
            {t.structure.deleteHint}{" "}
            <strong>
              {field?.displayName || field?.name || message?.displayName || message?.name}
            </strong>
          </p>
        ) : (
          <div className="schema-edit-grid">
            {text("name", t.structure.name, true)}
            {text("displayName", t.structure.displayName)}
            {!isField && text("typeId", t.structure.typeId, false, true, t.structure.optional)}
            {isField && (
              <>
                <label>
                  {t.structure.type}
                  <select
                    name="type"
                    value={values.type}
                    disabled={busy}
                    onChange={(event) => update("type", event.target.value)}
                  >
                    {[...primitiveTypes, "string", "bytes", "array"].map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.structure.byteOrder}
                  <select
                    name="endian"
                    value={values.endian}
                    disabled={busy}
                    onChange={(event) => update("endian", event.target.value)}
                  >
                    <option value="">{t.structure.inherited}</option>
                    <option value="big">Big Endian</option>
                    <option value="little">Little Endian</option>
                  </select>
                </label>
                {text("offset", t.structure.offset, false, true, t.structure.automaticLayout)}
                {values.type !== "array" &&
                  text(
                    "length",
                    t.structure.length,
                    values.type === "string" || values.type === "bytes",
                    true,
                    t.structure.naturalLength,
                  )}
                {values.type === "array" && (
                  <>
                    <label>
                      {t.structure.elementType}
                      <select
                        name="elementType"
                        value={values.elementType}
                        disabled={busy}
                        onChange={(event) => update("elementType", event.target.value)}
                      >
                        {primitiveTypes.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </label>
                    {text("count", t.structure.count, true, true)}
                  </>
                )}
                {["uint8", "uint16", "uint32", "uint64"].includes(values.type) && (
                  <label>
                    {t.structure.lengthOf}
                    <select
                      name="lengthOf"
                      value={values.lengthOf}
                      disabled={busy}
                      onChange={(event) => update("lengthOf", event.target.value)}
                    >
                      <option value="">{t.structure.none}</option>
                      {message?.fields
                        .filter((item) => item.name !== field?.name)
                        .map((item) => (
                          <option key={item.name} value={item.name}>
                            {item.displayName || item.name} ({item.name})
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {/^(u?int)(8|16|32|64)$/.test(values.type) && (
                  <label>
                    {locale === "zh-CN"
                      ? "枚举值（每行：名称=整数）"
                      : "Enum values (one name=integer per line)"}
                    <textarea
                      name="enum"
                      value={values.enum}
                      disabled={busy}
                      maxLength={4096}
                      rows={4}
                      placeholder={"Off=0\nOn=1"}
                      onChange={(event) => update("enum", event.target.value)}
                    />
                  </label>
                )}
                {/^(uint)(8|16|32|64)$/.test(values.type) && (
                  <label>
                    {locale === "zh-CN"
                      ? "位域（每行：名称=起始位:位宽[:显示名称]）"
                      : "Bits (name=offset:width[:display name] per line)"}
                    <textarea
                      name="bits"
                      value={values.bits}
                      disabled={busy}
                      maxLength={4096}
                      rows={4}
                      placeholder={"ready=0:1\nmode=1:3"}
                      onChange={(event) => update("bits", event.target.value)}
                    />
                  </label>
                )}
              </>
            )}
          </div>
        )}
        {!deleting && <p className="schema-edit-hint">{t.structure.editHint}</p>}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            {t.create.cancel}
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {deleting ? titles[action] : t.editor.save}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
