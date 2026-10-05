export const customRawColumn = (id: string) => `__oculab_custom_${id.replace(/[^A-Za-z0-9]/g, "_")}`;

export type CustomOutputScope = "fixation" | "saccade";

export const customOutputScopes = (eventKind: "fixation" | "saccade" | "both"): CustomOutputScope[] =>
  eventKind === "both" ? ["fixation", "saccade"] : [eventKind];

const scopeSuffix = (scope?: CustomOutputScope) => scope === "fixation" ? "_Fixacoes" : scope === "saccade" ? "_Sacadas" : "";

export const customEventKey = (id: string, scope?: CustomOutputScope) => `Variavel_${id.replace(/[^A-Za-z0-9]/g, "_")}${scopeSuffix(scope)}`;

export const customSummaryKey = (id: string, scope?: CustomOutputScope) => `${customEventKey(id, scope)}_Resumo`;

export const customSdKey = (id: string, scope?: CustomOutputScope) => `${customEventKey(id, scope)}_DP`;

export const customOutputLabel = (label: string, scope?: CustomOutputScope) =>
  scope === "fixation" ? `${label} — fixações` : scope === "saccade" ? `${label} — sacadas` : label;
