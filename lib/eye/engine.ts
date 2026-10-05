import {
  type AuditItem,
  type EngineConfig,
  type Level1Row,
  type Level2Row,
  type ProcessResult,
  type RawRow,
} from "./types.ts";
import { customEventKey, customOutputScopes, customSdKey, customSummaryKey } from "./custom.ts";
import type { CustomAggregation, CustomVariableConfig } from "./types.ts";

type Event = {
  kind: "fixation" | "saccade";
  id: string;
  participant: string;
  group: string;
  moment: string;
  stimulus: string;
  trial: string;
  aoi: string;
  startRow: number;
  endRow: number;
  duration: number | null;
  amplitude: number | null;
  pupilLeft: number | null;
  pupilRight: number | null;
  sourceFile: string;
  sourceOrder: number;
  customValues: Record<string, number | null>;
};

const text = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const numberValue = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = text(value).replace(/\s/g, "").replace(",", ".");
  if (!normalized || [".", "na", "nan", "null", "undefined"].includes(normalized.toLowerCase())) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const round = (value: number | null, digits = 2) =>
  value === null ? null : Number(value.toFixed(digits));

const mean = (values: Array<number | null>) => {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};

const sd = (values: Array<number | null>) => {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (valid.length < 2) return null;
  const avg = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  return Math.sqrt(valid.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (valid.length - 1));
};

const summarize = (values: Array<number | null>, aggregation: CustomAggregation) => {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) return null;
  if (aggregation === "sum") return valid.reduce((total, value) => total + value, 0);
  if (aggregation === "min") return Math.min(...valid);
  if (aggregation === "max") return Math.max(...valid);
  if (aggregation === "count") return valid.length;
  return mean(valid);
};

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

const mapped = (row: RawRow, config: EngineConfig, key: keyof EngineConfig["mapping"]) => {
  const column = config.mapping[key];
  return column ? row[column] : undefined;
};

const contextKey = (event: Pick<Event, "participant" | "moment" | "stimulus" | "trial" | "sourceFile" | "sourceOrder">) =>
  [event.sourceOrder, event.sourceFile, event.participant, event.moment, event.stimulus, event.trial].join("\u241f");

function convertDuration(value: number | null, config: EngineConfig) {
  if (value === null || config.durationUnit === config.outputDurationUnit) return value;
  return config.durationUnit === "s" ? value * 1000 : value / 1000;
}

function collapseEvents(rows: RawRow[], config: EngineConfig) {
  const events: Event[] = [];
  let invalidPupilValues = 0;
  let excludedMissingStimulusRows = 0;
  let run = 0;
  let activeKey = "";
  let active: {
    key: string;
    kind: "fixation" | "saccade";
    id: string;
    participant: string;
    group: string;
    moment: string;
    stimulus: string;
    trial: string;
    aoi: string;
    rows: number[];
    durations: Array<number | null>;
    amplitudes: Array<number | null>;
    pupilsLeft: Array<number | null>;
    pupilsRight: Array<number | null>;
    sourceFile: string;
    sourceOrder: number;
    customValues: Record<string, Array<number | null>>;
  } | null = null;

  const flush = () => {
    if (!active) return;
    const firstDuration = active.durations.find((v) => v !== null) ?? null;
    events.push({
      kind: active.kind,
      id: active.id,
      participant: active.participant,
      group: config.groupAliases[active.group] ?? active.group,
      moment: active.moment,
      stimulus: active.stimulus,
      trial: active.trial,
      aoi: active.aoi,
      startRow: Math.min(...active.rows),
      endRow: Math.max(...active.rows),
      duration: round(convertDuration(firstDuration, config)),
      amplitude: round(mean(active.amplitudes)),
      pupilLeft: round(mean(active.pupilsLeft)),
      pupilRight: round(mean(active.pupilsRight)),
      sourceFile: active.sourceFile,
      sourceOrder: active.sourceOrder,
      customValues: Object.fromEntries((config.customVariables ?? []).map((variable) => [
        variable.id,
        round(mean(active!.customValues[variable.id] ?? [])),
      ])),
    });
    active = null;
  };

  rows.forEach((row, index) => {
    const eventLabel = text(mapped(row, config, "eventType"));
    const kind = same(eventLabel, config.fixationLabel)
      ? "fixation"
      : same(eventLabel, config.saccadeLabel)
        ? "saccade"
        : null;
    if (!kind) {
      flush();
      activeKey = "";
      return;
    }

    if (config.excludeMissingStimulus && config.mapping.stimulus && !text(mapped(row, config, "stimulus"))) {
      flush();
      activeKey = "";
      excludedMissingStimulusRows += 1;
      return;
    }

    const participant = text(mapped(row, config, "participant")) || "Participante não informado";
    const group = text(mapped(row, config, "group")) || "Grupo não informado";
    const moment = text(mapped(row, config, "moment")) || "Momento único";
    const stimulus = text(mapped(row, config, "stimulus")) || "Estímulo não informado";
    const trial = text(mapped(row, config, "trial"));
    const aoi = text(mapped(row, config, "aoi"));
    const sourceFile = text(mapped(row, config, "sourceFile"));
    const sourceOrder = numberValue(mapped(row, config, "sourceOrder")) ?? 1;
    const rawId = text(mapped(row, config, kind === "fixation" ? "fixationId" : "saccadeId"));
    const id = rawId || `run-${run}`;
    const nextKey = [sourceOrder, sourceFile, participant, moment, stimulus, trial, kind, id].join("\u241f");
    if (nextKey !== activeKey) {
      flush();
      run += 1;
      activeKey = nextKey;
      active = {
        key: nextKey,
        kind,
        id: rawId || `run-${run}`,
        participant,
        group,
        moment,
        stimulus,
        trial,
        aoi,
        rows: [],
        durations: [],
        amplitudes: [],
        pupilsLeft: [],
        pupilsRight: [],
        sourceFile,
        sourceOrder,
        customValues: Object.fromEntries((config.customVariables ?? []).map((variable) => [variable.id, []])),
      };
    }

    const cleanPupil = (key: "pupilLeft" | "pupilRight") => {
      const value = numberValue(mapped(row, config, key));
      if (value !== null && value <= 0) {
        invalidPupilValues += 1;
        return null;
      }
      return value;
    };
    active!.rows.push(index + 2);
    active!.durations.push(numberValue(mapped(row, config, "duration")));
    active!.amplitudes.push(numberValue(mapped(row, config, "amplitude")));
    active!.pupilsLeft.push(cleanPupil("pupilLeft"));
    active!.pupilsRight.push(cleanPupil("pupilRight"));
    for (const variable of config.customVariables ?? []) {
      active!.customValues[variable.id].push(numberValue(row[variable.column]));
    }
  });
  flush();
  return { events, invalidPupilValues, excludedMissingStimulusRows };
}

function resolveAmplitudeSource(events: Event[], configured: EngineConfig["amplitudeSource"]): "fixation" | "saccade" {
  if (configured !== "auto") return configured;
  const fixations = events.filter((event) => event.kind === "fixation");
  const saccades = events.filter((event) => event.kind === "saccade");
  const fixationCoverage = fixations.length ? fixations.filter((event) => event.amplitude !== null).length / fixations.length : 0;
  const saccadeCoverage = saccades.length ? saccades.filter((event) => event.amplitude !== null).length / saccades.length : 0;
  return fixationCoverage >= saccadeCoverage ? "fixation" : "saccade";
}

function level1FromEvents(events: Event[], amplitudeSource: "fixation" | "saccade", customVariables: CustomVariableConfig[] = []): Level1Row[] {
  const buckets = new Map<string, Event[]>();
  for (const event of events) {
    const key = contextKey(event);
    buckets.set(key, [...(buckets.get(key) ?? []), event]);
  }

  const output: Level1Row[] = [];
  for (const bucket of buckets.values()) {
    const ordered = [...bucket].sort((a, b) => a.startRow - b.startRow);
    const fixations = ordered.filter((event) => event.kind === "fixation");
    const saccades = ordered.filter((event) => event.kind === "saccade");
    let first = true;

    const makeRow = (fixation: Event | null, saccade: Event | null): Level1Row => {
      const anchor = fixation ?? saccade;
      if (!anchor) throw new Error("Não foi possível identificar o evento da linha.");
      const binocular = fixation ? mean([fixation.pupilLeft, fixation.pupilRight]) : null;
      const row: Level1Row = {
        Arquivo: anchor.sourceFile,
        Ordem_Arquivo: anchor.sourceOrder,
        Participante: anchor.participant,
        Grupo: anchor.group,
        Momento: anchor.moment,
        Estimulo: anchor.stimulus,
        Tentativa: anchor.trial,
        AOI: fixation?.aoi ?? saccade?.aoi ?? "",
        N_Fixacoes: first ? fixations.length : ".",
        N_Sacadas: first ? saccades.length : ".",
        Fixacao_ID: fixation?.id ?? "",
        Duracao_Fixacao: fixation?.duration ?? null,
        Sacada_ID: saccade?.id ?? "",
        Duracao_Sacada: saccade?.duration ?? null,
        Sacada_Emparelhada: Boolean(fixation && saccade),
        Amplitude_Sacadica: amplitudeSource === "fixation" ? fixation?.amplitude ?? null : saccade?.amplitude ?? null,
        Pupila_Esquerda: fixation?.pupilLeft ?? null,
        Pupila_Direita: fixation?.pupilRight ?? null,
        Pupila_Binocular: round(binocular),
        Linha_Inicial_Fixacao: fixation?.startRow ?? null,
        Linha_Inicial_Sacada: saccade?.startRow ?? null,
        Linha_Ordem_Evento: fixation?.startRow ?? saccade?.startRow ?? anchor.startRow,
      };
      for (const variable of customVariables) {
        for (const scope of customOutputScopes(variable.eventKind)) {
          row[customEventKey(variable.id, variable.eventKind === "both" ? scope : undefined)] = scope === "fixation"
            ? fixation?.customValues[variable.id] ?? null
            : saccade?.customValues[variable.id] ?? null;
        }
      }
      first = false;
      return row;
    };

    for (let position = 0; position < ordered.length; position += 1) {
      const event = ordered[position];
      if (event.kind === "fixation") {
        const immediatelyNext = ordered[position + 1];
        const pairedSaccade = immediatelyNext?.kind === "saccade" ? immediatelyNext : null;
        output.push(makeRow(event, pairedSaccade));
        continue;
      }

      const immediatelyPrevious = ordered[position - 1];
      if (immediatelyPrevious?.kind === "fixation") continue;
      output.push(makeRow(null, event));
    }
  }
  return output.sort((a, b) =>
    a.Ordem_Arquivo - b.Ordem_Arquivo ||
    a.Grupo.localeCompare(b.Grupo) ||
    a.Participante.localeCompare(b.Participante, undefined, { numeric: true }) ||
    a.Momento.localeCompare(b.Momento) ||
    a.Linha_Ordem_Evento - b.Linha_Ordem_Evento,
  );
}

const aggregate = (rows: Level1Row[], includeStimulus: boolean, config: EngineConfig): Level2Row => {
  const numeric = (key: keyof Level1Row) => rows.map((row) => typeof row[key] === "number" ? row[key] as number : null);
  const base: Level2Row = {
    Participante: rows[0]?.Participante ?? "",
    Grupo: rows[0]?.Grupo ?? "",
    Momento: rows[0]?.Momento ?? "",
  };
  if (includeStimulus) {
    base.Arquivo = rows[0]?.Arquivo ?? "";
    base.Ordem_Arquivo = rows[0]?.Ordem_Arquivo ?? 1;
    base.Estimulo = rows[0]?.Estimulo ?? "";
  }
  const metrics: Array<[string, keyof Level1Row]> = [
    ["Duracao_Fixacao", "Duracao_Fixacao"],
    ["Duracao_Sacada", "Duracao_Sacada"],
    ["Amplitude_Sacadica", "Amplitude_Sacadica"],
    ["Pupila_Esquerda", "Pupila_Esquerda"],
    ["Pupila_Direita", "Pupila_Direita"],
    ["Pupila_Binocular", "Pupila_Binocular"],
  ];
  base.N_Fixacoes = rows.filter((row) => Boolean(row.Fixacao_ID)).length;
  base.N_Sacadas = rows.filter((row) => Boolean(row.Sacada_ID)).length;
  base.N_Sacadas_Emparelhadas = rows.filter((row) => row.Sacada_Emparelhada && Boolean(row.Sacada_ID)).length;
  for (const [label, key] of metrics) {
    base[`${label}_Media`] = round(mean(numeric(key)));
    base[`${label}_DP`] = round(sd(numeric(key)));
  }
  for (const variable of config.customVariables ?? []) {
    for (const scope of customOutputScopes(variable.eventKind)) {
      const outputScope = variable.eventKind === "both" ? scope : undefined;
      const values = numeric(customEventKey(variable.id, outputScope));
      base[customSummaryKey(variable.id, outputScope)] = round(summarize(values, variable.aggregation));
      base[customSdKey(variable.id, outputScope)] = round(sd(values));
    }
  }
  return base;
};

const aggregateStimulusSummaries = (rows: Level2Row[], config: EngineConfig): Level2Row => {
  const valid = (key: string) => rows.map((row) => typeof row[key] === "number" ? row[key] as number : null);
  const count = (key: string) => {
    const values = valid(key).filter((value): value is number => value !== null);
    if (!values.length) return null;
    return config.countAggregation === "sum"
      ? values.reduce((total, value) => total + value, 0)
      : mean(values);
  };
  const base: Level2Row = {
    Participante: rows[0]?.Participante ?? "",
    Grupo: rows[0]?.Grupo ?? "",
    Momento: rows[0]?.Momento ?? "",
    N_Estimulos: rows.length,
  };
  for (const key of ["N_Fixacoes", "N_Sacadas", "N_Sacadas_Emparelhadas"]) {
    base[key] = round(count(key));
    base[`${key}_DP`] = round(sd(valid(key)));
  }
  for (const key of ["Duracao_Fixacao", "Duracao_Sacada", "Amplitude_Sacadica", "Pupila_Esquerda", "Pupila_Direita", "Pupila_Binocular"]) {
    const values = valid(`${key}_Media`);
    base[`${key}_Media`] = round(mean(values));
    base[`${key}_DP`] = round(sd(values));
  }
  for (const variable of config.customVariables ?? []) {
    for (const scope of customOutputScopes(variable.eventKind)) {
      const outputScope = variable.eventKind === "both" ? scope : undefined;
      const values = valid(customSummaryKey(variable.id, outputScope));
      const aggregation = variable.aggregation === "count" ? "sum" : variable.aggregation;
      base[customSummaryKey(variable.id, outputScope)] = round(summarize(values, aggregation));
      base[customSdKey(variable.id, outputScope)] = round(sd(values));
    }
  }
  return base;
};

const emptySummaryRow = (participant: string, group: string, moment: string, config: EngineConfig): Level2Row => {
  const row: Level2Row = {
    Participante: participant,
    Grupo: group,
    Momento: moment,
    N_Fixacoes: null,
    N_Sacadas: null,
    N_Sacadas_Emparelhadas: null,
    Duracao_Fixacao_Media: null,
    Duracao_Fixacao_DP: null,
    Duracao_Sacada_Media: null,
    Duracao_Sacada_DP: null,
    Amplitude_Sacadica_Media: null,
    Amplitude_Sacadica_DP: null,
    Pupila_Esquerda_Media: null,
    Pupila_Esquerda_DP: null,
    Pupila_Direita_Media: null,
    Pupila_Direita_DP: null,
    Pupila_Binocular_Media: null,
    Pupila_Binocular_DP: null,
  };
  for (const variable of config.customVariables ?? []) {
    for (const scope of customOutputScopes(variable.eventKind)) {
      const outputScope = variable.eventKind === "both" ? scope : undefined;
      row[customSummaryKey(variable.id, outputScope)] = null;
      row[customSdKey(variable.id, outputScope)] = null;
    }
  }
  return row;
};

function makeLevel2(level1: Level1Row[], config: EngineConfig, includeStimulus: boolean) {
  if (includeStimulus) {
    const buckets = new Map<string, Level1Row[]>();
    for (const row of level1) {
      const key = [row.Ordem_Arquivo, row.Arquivo, row.Participante, row.Grupo, row.Momento, row.Estimulo].join("\u241f");
      buckets.set(key, [...(buckets.get(key) ?? []), row]);
    }
    return [...buckets.values()]
      .map((bucket) => aggregate(bucket, true, config))
      .sort((a, b) => Number(a.Ordem_Arquivo ?? 1) - Number(b.Ordem_Arquivo ?? 1)
        || String(a.Participante ?? "").localeCompare(String(b.Participante ?? ""), undefined, { numeric: true })
        || String(a.Momento ?? "").localeCompare(String(b.Momento ?? ""))
        || String(a.Estimulo ?? "").localeCompare(String(b.Estimulo ?? ""), undefined, { numeric: true }));
  }
  const participants = new Map<string, { group: string; order: number }>();
  for (const row of level1) {
    const current = participants.get(row.Participante);
    if (!current || row.Ordem_Arquivo < current.order) participants.set(row.Participante, { group: row.Grupo, order: row.Ordem_Arquivo });
  }
  const observedMoments = Array.from(new Set(level1.map((row) => row.Momento)));
  const moments = config.studyDesign === "longitudinal" && config.moments.length
    ? config.moments
    : observedMoments;
  const orderedParticipants = [...participants].sort((a, b) =>
    a[1].order - b[1].order || a[0].localeCompare(b[0], undefined, { numeric: true }),
  );
  const result: Level2Row[] = [];
  for (const [participant, info] of orderedParticipants) {
    const group = info.group;
    for (const moment of moments) {
      const matches = level1.filter((row) => row.Participante === participant && row.Momento === moment);
      if (matches.length) result.push(aggregate(matches, false, config));
      else if (config.studyDesign === "longitudinal") result.push(emptySummaryRow(participant, group, moment, config));
    }
  }
  return result;
}

function makeParticipantSummary(level1: Level1Row[], byStimulus: Level2Row[], config: EngineConfig) {
  if (config.finalWeighting === "event") return makeLevel2(level1, config, false);
  const participants = new Map<string, { group: string; order: number }>();
  for (const row of level1) {
    const current = participants.get(row.Participante);
    if (!current || row.Ordem_Arquivo < current.order) participants.set(row.Participante, { group: row.Grupo, order: row.Ordem_Arquivo });
  }
  const observedMoments = Array.from(new Set(level1.map((row) => row.Momento)));
  const moments = config.studyDesign === "longitudinal" && config.moments.length ? config.moments : observedMoments;
  const orderedParticipants = [...participants].sort((a, b) =>
    a[1].order - b[1].order || a[0].localeCompare(b[0], undefined, { numeric: true }),
  );
  const result: Level2Row[] = [];
  for (const [participant, info] of orderedParticipants) {
    const group = info.group;
    for (const moment of moments) {
      const matches = byStimulus.filter((row) => row.Participante === participant && row.Momento === moment && typeof row.N_Fixacoes === "number");
      if (matches.length) result.push(aggregateStimulusSummaries(matches, config));
      else if (config.studyDesign === "longitudinal") result.push({ ...emptySummaryRow(participant, group, moment, config), N_Estimulos: null, N_Fixacoes_DP: null, N_Sacadas_DP: null, N_Sacadas_Emparelhadas_DP: null });
    }
  }
  return result;
}

function toWide(rows: Level2Row[], config: EngineConfig) {
  const idColumns = ["Participante", "Grupo"];
  const metricColumns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)).filter((key) => ![...idColumns, "Momento", "Estimulo"].includes(key))));
  const stimuli = Array.from(new Set(rows.map((row) => row.Estimulo).filter((value): value is string => typeof value === "string" && Boolean(value))));
  const buckets = new Map<string, Level2Row>();
  for (const row of rows) {
    const participant = String(row.Participante ?? "");
    const group = String(row.Grupo ?? "");
    const key = `${participant}\u241f${group}`;
    const output = buckets.get(key) ?? { Participante: participant, Grupo: group };
    const moment = String(row.Momento ?? "Momento").replace(/\s+/g, "_");
    const stimulus = row.Estimulo ? `_${String(row.Estimulo).replace(/\s+/g, "_")}` : "";
    for (const metric of metricColumns) output[`${metric}_${moment}${stimulus}`] = row[metric] ?? null;
    buckets.set(key, output);
  }
  void stimuli;
  void config;
  return [...buckets.values()];
}

function filterMetrics<T extends Record<string, unknown>>(rows: T[], config: EngineConfig): T[] {
  const contextEnabled = (field: keyof NonNullable<EngineConfig["contextFields"]>, mappedField: keyof EngineConfig["mapping"]) =>
    config.contextFields?.[field] ?? Boolean(config.mapping[mappedField]);
  const allowed = (key: string) => {
    if (key === "Participante") return contextEnabled("participant", "participant");
    if (key === "Grupo") return contextEnabled("group", "group");
    if (key === "Momento") return contextEnabled("moment", "moment");
    if (key === "Estimulo") return contextEnabled("stimulus", "stimulus");
    if (key === "Tentativa") return contextEnabled("trial", "trial");
    if (key === "AOI") return contextEnabled("aoi", "aoi");
    if (key === "Arquivo" || key === "Ordem_Arquivo") return contextEnabled("sourceFile", "sourceFile");
    if (["Fixacao_ID", "Sacada_ID", "Linha_Inicial_Fixacao", "Linha_Inicial_Sacada", "N_Estimulos"].includes(key)) return true;
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
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => allowed(key))) as T);
}

export function processEyeData(rows: RawRow[], config: EngineConfig): ProcessResult {
  if (!config.mapping.eventType) throw new Error("Mapeie a coluna de tipo do evento.");
  const normalizedConfig: EngineConfig = {
    ...config,
    amplitudeSource: config.amplitudeSource ?? "auto",
    finalWeighting: config.finalWeighting ?? "stimulus",
    countAggregation: config.countAggregation ?? "mean",
    excludeMissingStimulus: config.excludeMissingStimulus ?? true,
    outputSheets: config.outputSheets ?? { eventTrace: true, stimulusSummary: true, participantSummary: true, analysisMatrix: true },
  };
  const { events, invalidPupilValues, excludedMissingStimulusRows } = collapseEvents(rows, normalizedConfig);
  const resolvedAmplitudeSource = resolveAmplitudeSource(events, normalizedConfig.amplitudeSource);
  const level1Full = level1FromEvents(events, resolvedAmplitudeSource, normalizedConfig.customVariables);
  const byStimulusFull = makeLevel2(level1Full, config, true);
  const level2Full = makeParticipantSummary(level1Full, byStimulusFull, normalizedConfig);
  const level2WideFull = toWide(level2Full, config);
  const fixationEvents = events.filter((event) => event.kind === "fixation").length;
  const saccadeEvents = events.filter((event) => event.kind === "saccade").length;
  const pairedEvents = level1Full.filter((row) => row.Sacada_Emparelhada).length;
  const participants = new Set(level1Full.map((row) => row.Participante)).size;
  const sourceFiles = new Set(rows.map((row) => text(mapped(row, normalizedConfig, "sourceOrder")) || text(mapped(row, normalizedConfig, "sourceFile"))).filter(Boolean)).size || (rows.length ? 1 : 0);
  const moments = config.studyDesign === "longitudinal" && config.moments.length ? config.moments.length : new Set(level1Full.map((row) => row.Momento)).size;
  const expectedLongitudinalRows = participants * moments;
  const representedFixations = level1Full
    .filter((row) => row.Fixacao_ID)
    .map((row) => [row.Ordem_Arquivo, row.Arquivo, row.Participante, row.Momento, row.Estimulo, row.Tentativa, row.Fixacao_ID, row.Linha_Inicial_Fixacao].join("\u241f"));
  const representedSaccades = level1Full
    .filter((row) => row.Sacada_ID)
    .map((row) => [row.Ordem_Arquivo, row.Arquivo, row.Participante, row.Momento, row.Estimulo, row.Tentativa, row.Sacada_ID, row.Linha_Inicial_Sacada].join("\u241f"));
  const pairedSaccades = level1Full
    .filter((row) => row.Sacada_Emparelhada && row.Sacada_ID)
    .map((row) => [row.Ordem_Arquivo, row.Arquivo, row.Participante, row.Momento, row.Estimulo, row.Tentativa, row.Sacada_ID, row.Linha_Inicial_Sacada].join("\u241f"));
  const audit: AuditItem[] = [
    {
      status: "ok",
      test: "Arquivos do lote consolidados",
      detail: `${sourceFiles} ${sourceFiles === 1 ? "arquivo foi processado" : "arquivos foram processados"} na ordem definida pelo pesquisador.`,
    },
    {
      status: fixationEvents <= rows.length && saccadeEvents <= rows.length ? "ok" : "error",
      test: "Eventos não extrapolam o arquivo bruto",
      detail: `${fixationEvents} fixações e ${saccadeEvents} sacadas identificadas em ${rows.length} linhas brutas.`,
    },
    {
      status: representedFixations.length === fixationEvents && representedSaccades.length === saccadeEvents ? "ok" : "error",
      test: "Fixações e sacadas válidas preservadas",
      detail: `${fixationEvents} fixações e ${saccadeEvents} sacadas foram mantidas no rastreio. Eventos pareados compartilham a mesma linha.`,
    },
    {
      status: new Set(representedSaccades).size === representedSaccades.length && new Set(pairedSaccades).size === pairedSaccades.length ? "ok" : "error",
      test: "Sacadas registradas uma única vez",
      detail: `${pairedEvents} pares fixação → sacada imediata e ${saccadeEvents - pairedEvents} sacadas sem pareamento, todas preservadas sem duplicação.`,
    },
    {
      status: config.studyDesign === "cross-sectional" || level2Full.length === expectedLongitudinalRows ? "ok" : "error",
      test: config.studyDesign === "longitudinal" ? "Matriz longitudinal completa" : "Estrutura transversal preservada",
      detail: config.studyDesign === "longitudinal" ? `${participants} participantes × ${moments} momentos = ${expectedLongitudinalRows} linhas.` : `${level2Full.length} combinações observadas foram mantidas.`,
    },
    {
      status: invalidPupilValues ? "warning" : "ok",
      test: "Sanitização pupilar",
      detail: invalidPupilValues
        ? `${invalidPupilValues} ${invalidPupilValues === 1 ? "valor foi convertido" : "valores foram convertidos"} em ausente${invalidPupilValues === 1 ? "" : "s"} antes das médias.`
        : "Nenhum valor pupilar ≤ 0 foi encontrado.",
    },
    {
      status: "ok",
      test: "Origem da amplitude sacádica",
      detail: `Amplitude lida dos eventos de ${resolvedAmplitudeSource === "fixation" ? "fixação" : "sacada"}${normalizedConfig.amplitudeSource === "auto" ? " (detecção automática)" : " (definição manual)"}.`,
    },
    {
      status: excludedMissingStimulusRows ? "warning" : "ok",
      test: "Eventos sem estímulo",
      detail: excludedMissingStimulusRows
        ? `${excludedMissingStimulusRows} linhas de fixação/sacada sem estímulo foram ignoradas conforme a configuração.`
        : "Nenhuma linha elegível sem estímulo precisou ser ignorada.",
    },
  ];
  return {
    level1: filterMetrics(level1Full as unknown as Record<string, unknown>[], config) as unknown as Level1Row[],
    level2: filterMetrics(level2Full, config),
    level2Wide: filterMetrics(level2WideFull, config),
    byStimulus: filterMetrics(byStimulusFull, config),
    audit,
    summary: { rawRows: rows.length, fixationEvents, saccadeEvents, pairedEvents, invalidPupilValues, participants, expectedLongitudinalRows, excludedMissingStimulusRows, resolvedAmplitudeSource, sourceFiles },
  };
}
