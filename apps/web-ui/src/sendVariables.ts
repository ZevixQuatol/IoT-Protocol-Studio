import { environments, type EnvironmentConfig } from "./bridge";

export type SendValues = Record<string, string>;

export async function activeVariables(): Promise<{ values: SendValues; secrets: string[] }> {
  const result = await environments();
  if (!result.ok) throw new Error(result.error.message);
  const active = result.config.environments.find((item) => item.name === result.config.active);
  return {
    values: variablesFromConfig(result.config),
    secrets: (active?.variables ?? [])
      .filter((variable) => variable.sensitive && variable.defaultValue)
      .map((variable) => variable.defaultValue),
  };
}

export function variablesFromConfig(config: EnvironmentConfig): SendValues {
  const values: SendValues = Object.create(null);
  const active = config.environments.find((item) => item.name === config.active);
  for (const variable of active?.variables ?? []) {
    if (["random", "sequence", "timestamp"].includes(variable.name))
      throw new Error(`Reserved variable: ${variable.name}`);
    values[variable.name] = variable.defaultValue;
  }
  return values;
}

export function sendValues(variables: SendValues, sequence: number): SendValues {
  const random = new Uint16Array(1);
  crypto.getRandomValues(random);
  return {
    ...variables,
    random: String(random[0]),
    sequence: String(sequence),
    timestamp: String(Date.now()),
  };
}

export function resolveValue(template: string, values: SendValues): string {
  const references = template.replace(/\{\{\s*([A-Za-z_][A-Za-z_0-9]*)\s*\}\}/g, "");
  if (/\{\{|\}\}/.test(references)) throw new Error("Invalid variable reference");
  return template.replace(/\{\{\s*([A-Za-z_][A-Za-z_0-9]*)\s*\}\}/g, (_, name: string) => {
    if (!Object.hasOwn(values, name)) throw new Error(`Undefined variable: ${name}`);
    return values[name];
  });
}
