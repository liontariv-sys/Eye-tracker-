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
  aoiShares: Record<string, number>;
  aoiEntryTimestamps: Record<string, number>;
  timestamp: number | null;
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
    aoiSamples: string[][];
    timestamps: Array<number | null>;
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
    const aoiCounts = new Map<string, number>();
    const aoiEntryTimestamps = new Map<string, number>();
    active.aoiSamples.forEach((names, sampleIndex) => names.forEach((name) => {
      aoiCounts.set(name, (aoiCounts.get(name) ?? 0) + 1);
      const sampleTimestamp = active!.timestamps[sampleIndex];
      if (sampleTimestamp !== null) aoiEntryTimestamps.set(name, Math.min(aoiEntryTimestamps.get(name) ?? sampleTimestamp, sampleTimestamp));
    }));
    const aoiShares = Object.fromEntries([...aoiCounts].map(([name, count]) => [name, active!.aoiSamples.length ? count / active!.aoiSamples.length : 0]));
    events.push({
      kind: active.kind,
      id: active.id,
      participant: active.participant,
      group: config.groupAliases[active.group] ?? active.group,
      moment: active.moment,
      stimulus: active.stimulus,
      trial: active.trial,
      aoi: active.aoi,
      aoiShares,
      aoiEntryTimestamps: Object.fromEntries(aoiEntryTimestamps),
      timestamp: active.timestamps.find((value) => value !== null) ?? null,
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
    const normalizedAois = Array.isArray(row.__oculab_aoi_names)
      ? row.__oculab_aoi_names.map((value) => text(value)).filter(Boolean)
      : (aoi ? [aoi] : []);
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
        aoiSamples: [],
        timestamps: [],
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
    active!.aoiSamples.push(normalizedAois);
    active!.timestamps.push(numberValue(mapped(row, config, "timestamp")));
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
    base[`${key}_DP`] = round(sd(vh)
