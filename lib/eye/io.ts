import * as XLSX from "xlsx";
import { buildStyledXlsx, type FormulaCell, type HeaderTone, type SheetColumn, type SheetRow, type StyledSheet } from "./styled-xlsx.ts";
import { customEventKey, customOutputLabel, customOutputScopes, customSdKey, customSummaryKey } from "./custom.ts";
import type { ColumnMap, EngineConfig, MetricKey, ProcessResult, RawRow } from "./types.ts";

const aliases: Record<keyof ColumnMap, string[]> = {
  participant: ["participant", "participantname", "participant name", "participante", "subject", "respondent", "nome"],
  group: ["group", "grupo", "condition group"],
  moment: ["moment", "momento", "timepoint", "etapa", "tempo"],
  stimulus: ["medianame", "media name", "stimulus", "estimulo", "estímulo"],
  trial: ["trial", "tentativa", "recording", "recording name"],
  aoi: ["aoi", "area of interest", "área de interesse", "area de interesse"],
  eventType: ["gazeeventtype", "gaze event type", "eventtype", "tipo de evento"],
  fixationId: ["fixationindex", "fixation index", "fixationid", "fixation id"],
  saccadeId: ["saccadeindex", "saccade index", "saccadeid", "saccade id"],
  duration: ["gazeeventduration", "gaze event duration", "duration", "duração", "duracao"],
  amplitude: ["saccadicamplitude", "saccadic amplitude", "saccade amplitude", "amplitude sacádica", "amplitude sacadica"],
  pupilLeft: ["pupilleft", "pupil left", "left pupil", "pupila esquerda"],
  pupilRight: ["pupilright", "pupil right", "right pupil", "pupila direita"],
  timestamp: ["timestamp", "recordingtimestamp", "recording timestamp", "tempo de gravação"],
  sourceFile: ["__oculab_source_file"],
  sourceOrder: ["__oculab_source_order"],
};

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

export function suggestMapping(headers: string[]): ColumnMap {
  const mapping: ColumnMap = {};
  for (const [field, candidates] of Object.entries(aliases) as Array<[keyof ColumnMap, string[]]>) {
    const found = headers.find((header) => candidates.some((candidate) => normalize(header) === normalize(candidate)));
    if (found) mapping[field] = found;
  }
  return mapping;
}

export function detectDurationUnit(rows: RawRow[], mapping: ColumnMap): "ms" | "s" | null {
  if (!mapping.duration) return null;
  const values = rows.slice(0, 25000)
    .map((row) => {
      const value = row[mapping.duration!];
      if (typeof value === "number") return value;
      const parsed = Number(String(value ?? "").trim().replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((value): value is number => value !== null && value > 0)
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const median = values[Math.floor(values.length / 2)];
  return median > 10 ? "ms" : "s";
}

export function detectEventLabels(rows: RawRow[], mapping: ColumnMap) {
  if (!mapping.eventType) return { fixation: "Fixation", saccade: "Saccade" };
  const values = Array.from(new Set(rows.slice(0, 25000)
    .map((row) => String(row[mapping.eventType!] ?? "").trim())
    .filter(Boolean)));
  const normalized = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const fixation = values.find((value) => /^(fixation|fixacao|fix)$/.test(normalized(value))) ?? "Fixation";
  const saccade = values.find((value) => /^(saccade|sacada|sac)$/.test(normalized(value))) ?? "Saccade";
  return { fixation, saccade };
}

export async function readDataFile(file: File) {
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array", raw: true, cellDates: false });
  const sheets = workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets[name], { defval: null, raw: true });
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    return { name, rows, headers };
  }).filter((sheet) => sheet.rows.length);
  if (!sheets.length) throw new Error("Nenhuma linha de dados foi encontrada.");
  return { sheets };
}

type ExportColumn = SheetColumn & { key: string };

type MetricExport = {
  key: MetricKey;
  tone: HeaderTone;
  phase1Key: string;
  phase1Label: (unit: string) => string;
  phase1Format: "integer" | "decimal";
  phase2Key: string;
  phase2DpKey: string;
  phase2Label: (unit: string) => string;
};

const metricExports: MetricExport[] = [
  { key: "fixationCount", tone: "count", phase1Key: "N_Fixacoes", phase1Label: () => "Nº de fixações", phase1Format: "integer", phase2Key: "N_Fixacoes", phase2DpKey: "N_Fixacoes_DP", phase2Label: () => "Nº de fixações" },
  { key: "saccadeCount", tone: "saccade", phase1Key: "N_Sacadas", phase1Label: () => "Nº de sacadas", phase1Format: "integer", phase2Key: "N_Sacadas", phase2DpKey: "N_Sacadas_DP", phase2Label: () => "Nº de sacadas" },
  { key: "fixationDuration", tone: "fixation", phase1Key: "Duracao_Fixacao", phase1Label: (unit) => `Duração da fixação (${unit})`, phase1Format: "decimal", phase2Key: "Duracao_Fixacao_Media", phase2DpKey: "Duracao_Fixacao_DP", phase2Label: (unit) => `Tempo médio das fixações (${unit})` },
  { key: "saccadeDuration", tone: "saccade", phase1Key: "Duracao_Sacada", phase1Label: (unit) => `Duração da sacada (${unit})`, phase1Format: "decimal", phase2Key: "Duracao_Sacada_Media", phase2DpKey: "Duracao_Sacada_DP", phase2Label: (unit) => `Tempo médio das sacadas (${unit})` },
  { key: "saccadicAmplitude", tone: "amplitude", phase1Key: "Amplitude_Sacadica", phase1Label: () => "Amplitude sacádica", phase1Format: "decimal", phase2Key: "Amplitude_Sacadica_Media", phase2DpKey: "Amplitude_Sacadica_DP", phase2Label: () => "Amplitude média das sacadas" },
  { key: "pupilLeft", tone: "pupil", phase1Key: "Pupila_Esquerda", phase1Label: () => "Pupila esquerda", phase1Format: "decimal", phase2Key: "Pupila_Esquerda_Media", phase2DpKey: "Pupila_Esquerda_DP", phase2Label: () => "Pupila esquerda média" },
  { key: "pupilRight", tone: "pupil", phase1Key: "Pupila_Direita", phase1Label: () => "Pupila direita", phase1Format: "decimal", phase2Key: "Pupila_Direita_Media", phase2DpKey: "Pupila_Direita_DP", phase2Label: () => "Pupila direita média" },
  { key: "pupilBinocular", tone: "pupil", phase1Key: "Pupila_Binocular", phase1Label: () => "Pupila binocular", phase1Format: "decimal", phase2Key: "Pupila_Binocular_Media", phase2DpKey: "Pupila_Binocular_DP", phase2Label: () => "Pupila binocular média" },
];

const contextEnabled = (config: EngineConfig, field: keyof NonNullable<EngineConfig["contextFields"]>) =>
  config.contextFields?.[field] ?? Boolean(config.mapping[field]);

const contextColumns = (config: EngineConfig, fields: Array<keyof ColumnMap>): ExportColumn[] => {
  const labels: Partial<Record<keyof ColumnMap, [string, string, number]>> = {
    sourceFile: ["Arquivo", "Arquivo de origem", 31],
    participant: ["Participante", "Participante", 18],
    group: ["Grupo", "Grupo", 18],
    moment: ["Momento", "Momento", 17],
    stimulus: ["Estimulo", "Estímulo", 25],
    trial: ["Tentativa", "Tentativa", 16],
    aoi: ["AOI", "Área de interesse", 22],
  };
  return fields.flatMap((field) => {
    const definition = labels[field];
    return definition && contextEnabled(config, field as keyof NonNullable<EngineConfig["contextFields"]>) ? [{ key: definition[0], header: definition[1], width: definition[2], tone: "context" as const, format: "text" as const }] : [];
  });
};

const numericValues = (rows: Record<string, unknown>[], key: string) => rows.map((row) => row[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
const average = (values: number[]) => values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
const deviation = (values: number[]) => {
  if (values.length < 2) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number(Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)).toFixed(2));
};

const cellRange = (columnIndex: number, startRow: number, endRow: number) => {
  let label = "";
  let value = columnIndex + 1;
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return `${label}${startRow}:${label}${endRow}`;
};

function phase1Sheet(result: ProcessResult, config: EngineConfig): StyledSheet {
  const columns: ExportColumn[] = [
    ...contextColumns(config, ["sourceFile", "participant", "group", "moment", "stimulus", "trial", "aoi"]),
    ...metricExports.filter((metric) => config.metrics[metric.key]).map((metric) => ({
      key: metric.phase1Key,
      header: metric.phase1Label(config.outputDurationUnit),
      width: metric.phase1Key.includes("Duracao") ? 23 : metric.phase1Key.includes("Pupila") ? 19 : 17,
      tone: metric.tone,
      format: metric.phase1Format,
    })),
    ...(config.customVariables ?? []).flatMap((variable) => customOutputScopes(variable.eventKind).map((scope) => {
      const outputScope = variable.eventKind === "both" ? scope : undefined;
      const header = customOutputLabel(variable.label, outputScope);
      return {
        key: customEventKey(variable.id, outputScope),
        header,
        width: Math.min(36, Math.max(18, header.length + 3)),
        tone: "neutral" as const,
        format: "decimal" as const,
      };
    })),
  ];
  let lastBlock = "";
  let band = false;
  const rows: SheetRow[] = (result.level1 as unknown as Record<string, unknown>[]).map((row) => {
    const block = [row.Ordem_Arquivo, row.Arquivo, row.Participante, row.Grupo, row.Momento, row.Estimulo, row.Tentativa].join("¦");
    const starts = block !== lastBlock;
    if (starts) band = !band;
    lastBlock = block;
    return { cells: columns.map((column) => row[column.key] as string | number | null), kind: starts ? "group-start" : "data", band };
  });
  return { name: "1_Eventos", columns, rows, freezeHeader: true, autoFilter: true };
}

function phase2Sheet(result: ProcessResult, config: EngineConfig): StyledSheet {
  const contexts = contextColumns(config, ["sourceFile", "participant", "group", "moment", "stimulus"]);
  const targets = [
    ...metricExports.filter((metric) => config.metrics[metric.key]).map((metric) => ({
      phase2Key: metric.phase2Key,
      header: metric.phase2Label(config.outputDurationUnit),
      tone: metric.tone,
      formula: metric.key === "fixationCount" || metric.key === "saccadeCount"
        ? (config.countAggregation === "sum" ? "SUM" : "AVERAGE")
        : "AVERAGE",
    })),
    ...(config.customVariables ?? []).flatMap((variable) => customOutputScopes(variable.eventKind).map((scope) => {
      const outputScope = variable.eventKind === "both" ? scope : undefined;
      return {
        phase2Key: customSummaryKey(variable.id, outputScope),
        header: customOutputLabel(variable.label, outputScope),
        tone: "neutral" as const,
        formula: variable.aggregation === "sum" || variable.aggregation === "count" ? "SUM" : variable.aggregation === "min" ? "MIN" : variable.aggregation === "max" ? "MAX" : "AVERAGE",
      };
    })),
  ];
  const columns: ExportColumn[] = [
    ...contexts,
    ...targets.map((metric) => ({ key: metric.phase2Key, header: metric.header, width: metric.phase2Key.includes("Duracao") ? 28 : Math.min(34, Math.max(21, metric.header.length + 3)), tone: metric.tone, format: "decimal" as const })),
  ];
  const source = result.byStimulus as Record<string, unknown>[];
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of source) {
    const key = [row.Ordem_Arquivo, row.Arquivo, row.Participante, row.Grupo, row.Momento].join("¦");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const rows: SheetRow[] = [];
  let band = false;
  for (const blockRows of groups.values()) {
    const observed = blockRows.filter((row) => targets.some((metric) => typeof row[metric.phase2Key] === "number"));
    if (!observed.length) continue;
    band = !band;
    const firstDataExcelRow = rows.length + 2;
    observed.forEach((row, index) => rows.push({ cells: columns.map((column) => row[column.key] as string | number | null), kind: index === 0 ? "group-start" : "data", band }));
    const lastDataExcelRow = rows.length + 1;
    const labelColumn = Math.max(0, contexts.findIndex((column) => column.key === "Estimulo"));
    const summaryCells = columns.map((column, index) => {
      if (index === labelColumn) return config.countAggregation === "sum" ? "TOTAL / MÉDIA" : "MÉDIA";
      const target = targets.find((metric) => metric.phase2Key === column.key);
      if (!target) return null;
      const values = numericValues(observed, target.phase2Key);
      const range = cellRange(index, firstDataExcelRow, lastDataExcelRow);
      const value = target.formula === "SUM"
        ? Number(values.reduce((sum, current) => sum + current, 0).toFixed(2))
        : target.formula === "MIN"
          ? (values.length ? Math.min(...values) : null)
          : target.formula === "MAX"
            ? (values.length ? Math.max(...values) : null)
            : average(values);
      return { formula: `${target.formula}(${range})`, value } satisfies FormulaCell;
    });
    const deviationCells = columns.map((column, index) => {
      if (index === labelColumn) return "DP";
      const target = targets.find((metric) => metric.phase2Key === column.key);
      if (!target) return null;
      const values = numericValues(observed, target.phase2Key);
      const range = cellRange(index, firstDataExcelRow, lastDataExcelRow);
      return { formula: `IF(COUNT(${range})>1,STDEV.S(${range}),\"\")`, value: deviation(values) } satisfies FormulaCell;
    });
    rows.push({ cells: summaryCells, kind: "summary" }, { cells: deviationCells, kind: "deviation" });
  }
  return { name: "2_Resumo_estimulos", columns, rows, freezeHeader: true };
}

const metricEnabledForKey = (key: string, config: EngineConfig) => {
  if (key.startsWith("N_Fixacoes")) return config.metrics.fixationCount;
  if (key.startsWith("N_Sacadas_Emparelhadas")) return false;
  if (key.startsWith("N_Sacadas")) return config.metrics.saccadeCount;
  if (key.startsWith("Duracao_Fixacao")) return config.metrics.fixationDuration;
  if (key.startsWith("Duracao_Sacada")) return config.metrics.saccadeDuration;
  if (key.startsWith("Amplitude_Sacadica")) return config.metrics.saccadicAmplitude;
  if (key.startsWith("Pupila_Esquerda")) return config.metrics.pupilLeft;
  if (key.startsWith("Pupila_Direita")) return config.metrics.pupilRight;
  if (key.startsWith("Pupila_Binocular")) return config.metrics.pupilBinocular;
  if ((config.customVariables ?? []).some((variable) => key.startsWith(customEventKey(variable.id)))) return true;
  return false;
};

const toneForKey = (key: string): HeaderTone => key.startsWith("N_Fixacoes") ? "count" : key.startsWith("N_Sacadas") || key.startsWith("Duracao_Sacada") ? "saccade" : key.startsWith("Duracao_Fixacao") ? "fixation" : key.startsWith("Amplitude") ? "amplitude" : key.startsWith("Pupila") ? "pupil" : "context";
const statName = (key: string) => {
  const normalized = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^([^A-Za-z])/, "v_$1");
  return normalized.slice(0, 64);
};

const customStatName = (key: string, config: EngineConfig) => {
  for (const variable of config.customVariables ?? []) {
    for (const scope of customOutputScopes(variable.eventKind)) {
      const outputScope = variable.eventKind === "both" ? scope : undefined;
      const summary = customSummaryKey(variable.id, outputScope);
      const deviationKey = customSdKey(variable.id, outputScope);
      const label = customOutputLabel(variable.label, outputScope);
      if (key.startsWith(summary)) return statName(`${label}${key.slice(summary.length)}`);
      if (key.startsWith(deviationKey)) return statName(`${label}_DP${key.slice(deviationKey.length)}`);
    }
  }
  return statName(key);
};

function statisticalSheet(name: string, rows: Record<string, unknown>[], config: EngineConfig, wide: boolean): StyledSheet {
  const structural = wide ? ["Participante", "Grupo"] : ["Participante", "Grupo", "Momento"];
  const available = rows.length ? Object.keys(rows[0]) : structural;
  const keys = available.filter((key) => {
    if (key === "Participante") return contextEnabled(config, "participant");
    if (key === "Grupo") return contextEnabled(config, "group");
    if (key === "Momento") return contextEnabled(config, "moment");
    return metricEnabledForKey(key, config);
  });
  const orderedKeys = [...structural.filter((key) => keys.includes(key)), ...keys.filter((key) => !structural.includes(key))];
  const columns: ExportColumn[] = orderedKeys.map((key) => ({ key, header: customStatName(key, config), width: Math.min(28, Math.max(15, customStatName(key, config).length + 2)), tone: toneForKey(key), format: structural.includes(key) ? "text" : "decimal" }));
  return {
    name,
    columns,
    rows: rows.map((row, index) => ({ cells: columns.map((column) => row[column.key] as string | number | null), band: index % 2 === 1 })),
    freezeHeader: true,
    autoFilter: true,
  };
}

function dictionarySheet(statSheets: StyledSheet[], config: EngineConfig): StyledSheet {
  const seen = new Set<string>();
  const rows: SheetRow[] = [];
  for (const sheet of statSheets) {
    for (const column of sheet.columns) {
      if (seen.has(column.header)) continue;
      seen.add(column.header);
      const metric = metricExports.find((item) => column.key.startsWith(item.phase1Key) || column.key.startsWith(item.phase2Key));
      const custom = (config.customVariables ?? []).find((item) => column.key.startsWith(customEventKey(item.id)));
      const customScope = custom?.eventKind === "both" ? (column.key.includes("_Fixacoes") ? "fixation" : column.key.includes("_Sacadas") ? "saccade" : undefined) : undefined;
      const customAggregation = custom ? ({ mean: "média", sum: "soma", min: "mínimo", max: "máximo", count: "contagem" } as const)[custom.aggregation] : "";
      const meaning = column.key === "Participante" ? "Código do participante" : column.key === "Grupo" ? "Grupo informado no aplicativo" : column.key === "Momento" ? "Etapa da coleta" : metric ? metric.phase2Label(config.outputDurationUnit) + (column.key.includes("_DP") ? "; DP = desvio-padrão" : "") : custom ? `${customOutputLabel(custom.label, customScope)}; resumo por ${customAggregation}${column.key.includes("_DP") ? "; DP = desvio-padrão" : ""}` : column.key.replaceAll("_", " ");
      rows.push({ cells: [column.header, meaning, column.format === "text" ? "Texto" : "Numérica", column.key.includes("Duracao") ? config.outputDurationUnit : "", sheet.name] });
    }
  }
  return { name: "3_Dicionario", columns: [
    { header: "Variável", width: 28, tone: "context", format: "text" },
    { header: "Significado", width: 44, tone: "neutral", format: "text" },
    { header: "Tipo", width: 14, tone: "neutral", format: "text" },
    { header: "Unidade", width: 14, tone: "neutral", format: "text" },
    { header: "Planilha", width: 24, tone: "neutral", format: "text" },
  ], rows, freezeHeader: true, autoFilter: true };
}

function supportSheets(result: ProcessResult, config: EngineConfig, sourceName: string): StyledSheet[] {
  const audit: StyledSheet = {
    name: "Auditoria",
    columns: [{ header: "Status", width: 13, tone: "context", format: "text" }, { header: "Verificação", width: 38, tone: "neutral", format: "text" }, { header: "Detalhe", width: 78, tone: "neutral", format: "text" }],
    rows: result.audit.map((item) => ({ cells: [item.status === "ok" ? "APROVADO" : item.status === "warning" ? "ATENÇÃO" : "FALHOU", item.test, item.detail], kind: item.status })),
    freezeHeader: true,
  };
  const readme: StyledSheet = {
    name: "Leia-me",
    columns: [{ header: "Parte do arquivo", width: 28, tone: "context", format: "text" }, { header: "Como usar", width: 92, tone: "neutral", format: "text" }],
    rows: [
      { cells: ["Fase 1 — Eventos", "Mostra todas as fixações e sacadas válidas em ordem. Eventos pareados compartilham a mesma linha."] },
      { cells: ["Fase 2 — Estímulos", "Mostra um resumo de cada estímulo. As linhas amarelas apresentam a média ou total e o desvio-padrão (DP)."] },
      { cells: ["Fase 3 — Formato longo", "Cada linha representa um participante em um momento. Use esta guia no SPSS/JASP quando os momentos devem ficar em linhas."] },
      { cells: ["Fase 3 — Formato amplo", "Cada participante ocupa uma linha e cada momento tem suas próprias colunas. É útil para medidas repetidas."] },
      { cells: ["Grupo", "A coluna Grupo usa o valor informado para cada arquivo no início da tabulação."] },
      { cells: ["Valores ausentes", "Célula vazia significa dado ausente. Não substitua por zero."] },
      { cells: ["Pupila", "Valores de pupila iguais ou menores que zero foram tratados como ausentes antes das médias."] },
      { cells: ["Auditoria", "Confira esta guia para saber se as contagens, os pares fixação–sacada e os momentos esperados passaram nas verificações."] },
    ],
  };
  const configRows = [
    ["Arquivo de origem", sourceName], ["Gerado em", new Date().toISOString()], ["Classificação dos eventos", "Os rótulos de cada arquivo foram normalizados como Fixation e Saccade"],
    ["Unidade usada no processamento", config.durationUnit], ["Unidade de saída", config.outputDurationUnit], ["Desenho do estudo", config.studyDesign], ["Formato para SPSS/JASP", config.outputLayout],
    ["Origem da amplitude", config.amplitudeSource], ["Cálculo da média final", config.finalWeighting === "stimulus" ? "Mesmo peso para cada estímulo" : "Todos os eventos reunidos"],
    ["Agregação das contagens", config.countAggregation === "mean" ? "Média por estímulo" : "Total por participante"], ["Ignorar linhas sem estímulo", config.excludeMissingStimulus ? "Sim" : "Não"],
    ["Momentos esperados", config.moments.join(" | ")],
    ...(config.customVariables ?? []).map((variable) => [`Variável adicional: ${variable.label}`, `${variable.eventKind === "fixation" ? "Fixações" : variable.eventKind === "saccade" ? "Sacadas" : "Fixações e sacadas em resultados separados"}; ${variable.aggregation}`]),
    ...Object.entries(config.mapping).map(([key, value]) => [`Mapeamento: ${key}`, value ?? ""]),
  ];
  const configuration: StyledSheet = { name: "Configuracao", columns: [{ header: "Parâmetro", width: 34, tone: "context", format: "text" }, { header: "Valor", width: 72, tone: "neutral", format: "text" }], rows: configRows.map((cells) => ({ cells })) };
  return [audit, readme, configuration];
}

export function buildExportWorkbookBytes(result: ProcessResult, config: EngineConfig, sourceName: string) {
  const output = config.outputSheets ?? { eventTrace: true, stimulusSummary: true, participantSummary: true, analysisMatrix: true };
  const sheets: StyledSheet[] = [];
  if (output.eventTrace) sheets.push(phase1Sheet(result, config));
  if (output.stimulusSummary) sheets.push(phase2Sheet(result, config));
  const statSheets: StyledSheet[] = [];
  if (output.participantSummary && config.outputLayout !== "wide") statSheets.push(statisticalSheet("3_SPSS_JASP_longo", result.level2, config, false));
  if (output.analysisMatrix && config.outputLayout !== "long") statSheets.push(statisticalSheet("3_SPSS_JASP_amplo", result.level2Wide, config, true));
  sheets.push(...statSheets);
  if (statSheets.length) sheets.push(dictionarySheet(statSheets, config));
  sheets.push(...supportSheets(result, config, sourceName));
  return buildStyledXlsx(sheets);
}

export function exportWorkbook(result: ProcessResult, config: EngineConfig, sourceName: string) {
  const bytes = buildExportWorkbookBytes(result, config, sourceName);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `LPNeC_Oculab_${sourceName.replace(/\.[^.]+$/, "") || "dados"}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const demoRows: RawRow[] = [
  { Participante: "P01", Grupo: "Grupo A", Momento: "Momento 1", MediaName: "Estimulo_01", Tentativa: "T1", GazeEventType: "Fixation", FixationIndex: 1, SaccadeIndex: null, GazeEventDuration: 0.42, SaccadicAmplitude: null, PupilLeft: 3.24, PupilRight: 3.11 },
  { Participante: "P01", Grupo: "Grupo A", Momento: "Momento 1", MediaName: "Estimulo_01", Tentativa: "T1", GazeEventType: "Fixation", FixationIndex: 1, SaccadeIndex: null, GazeEventDuration: 0.42, SaccadicAmplitude: null, PupilLeft: 3.28, PupilRight: 0 },
  { Participante: "P01", Grupo: "Grupo A", Momento: "Momento 1", MediaName: "Estimulo_01", Tentativa: "T1", GazeEventType: "Saccade", FixationIndex: null, SaccadeIndex: 1, GazeEventDuration: 0.046, SaccadicAmplitude: 4.82, PupilLeft: null, PupilRight: null },
  { Participante: "P01", Grupo: "Grupo A", Momento: "Momento 1", MediaName: "Estimulo_01", Tentativa: "T1", GazeEventType: "Fixation", FixationIndex: 2, SaccadeIndex: null, GazeEventDuration: 0.31, SaccadicAmplitude: null, PupilLeft: 3.09, PupilRight: 3.04 },
  { Participante: "P01", Grupo: "Grupo A", Momento: "Momento 1", MediaName: "Estimulo_01", Tentativa: "T1", GazeEventType: "Saccade", FixationIndex: null, SaccadeIndex: 2, GazeEventDuration: 0.039, SaccadicAmplitude: 3.71, PupilLeft: null, PupilRight: null },
  { Participante: "P02", Grupo: "Grupo B", Momento: "Momento 2", MediaName: "Estimulo_02", Tentativa: "T1", GazeEventType: "Fixation", FixationIndex: 1, SaccadeIndex: null, GazeEventDuration: 0.37, SaccadicAmplitude: null, PupilLeft: 3.51, PupilRight: 3.43 },
  { Participante: "P02", Grupo: "Grupo B", Momento: "Momento 2", MediaName: "Estimulo_02", Tentativa: "T1", GazeEventType: "Saccade", FixationIndex: null, SaccadeIndex: 1, GazeEventDuration: 0.052, SaccadicAmplitude: 5.16, PupilLeft: null, PupilRight: null },
];
