import type { Theme } from "./i18n";

export type ThemeMode = Theme | "system";
export type DisplayPreferences = {
  fontSize: 12 | 13 | 15;
  rowHeight: "compact" | "standard" | "comfortable";
  hexFont: "consolas" | "cascadia" | "system";
  lineNumbers: boolean;
  milliseconds: boolean;
};

const key = "iotps.display";
export const defaultDisplay: DisplayPreferences = {
  fontSize: 13,
  rowHeight: "standard",
  hexFont: "consolas",
  lineNumbers: true,
  milliseconds: true,
};

export function readDisplay(): DisplayPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}");
    return {
      fontSize: [12, 13, 15].includes(value.fontSize) ? value.fontSize : 13,
      rowHeight: ["compact", "standard", "comfortable"].includes(value.rowHeight)
        ? value.rowHeight
        : "standard",
      hexFont: ["consolas", "cascadia", "system"].includes(value.hexFont)
        ? value.hexFont
        : "consolas",
      lineNumbers: typeof value.lineNumbers === "boolean" ? value.lineNumbers : true,
      milliseconds: typeof value.milliseconds === "boolean" ? value.milliseconds : true,
    };
  } catch {
    return { ...defaultDisplay };
  }
}

export function applyDisplay(value: DisplayPreferences) {
  const root = document.documentElement;
  root.style.setProperty("--ui-font-size", `${value.fontSize}px`);
  root.style.setProperty(
    "--ui-row-padding",
    `${{ compact: 5, standard: 8, comfortable: 12 }[value.rowHeight]}px`,
  );
  root.style.setProperty(
    "--hex-font",
    {
      consolas: 'Consolas, "Courier New", monospace',
      cascadia: '"Cascadia Code", Consolas, monospace',
      system: "ui-monospace, monospace",
    }[value.hexFont],
  );
  root.dataset.lineNumbers = String(value.lineNumbers);
  root.dataset.fontSize = String(value.fontSize);
  root.dataset.rowHeight = value.rowHeight;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences still apply for the current run when storage is unavailable.
  }
}

export function readThemeMode(): ThemeMode {
  try {
    const value = localStorage.getItem("iotps.theme-mode") ?? localStorage.getItem("iotps.theme");
    if (value === "dark" || value === "light" || value === "system") return value;
  } catch {
    // Preserve the application's established light-theme default.
  }
  return "light";
}

export function resolveTheme(mode: ThemeMode): Theme {
  return mode === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : mode;
}

export function storeThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem("iotps.theme-mode", mode);
  } catch {
    // The selected mode remains active for this run.
  }
}
