import { customRawColumn } from "./custom.ts";
import type { ColumnMap, CustomVariableConfig, RawRow } from "./types.ts";

export interface BatchDatasetInput {
  id: string;
  fileName: string;
  rows: RawRow[];
  mapping: ColumnMap;
  fixationLabel?: string;
  saccadeLabel?: string;
  customMappings?: Record<string, string>;
  participantOverride?: string;
  groupOverride?: string;
  durationUnit: "ms" | "s";
}

export const batchMapping: ColumnMap = {
  participant: "__oculab_participant",
  group: "__oculab_group",
  moment: "__oculab_moment",
  stimulus: "__oculab_stimulus",
  trial: "__oculab_trial",
  aoi: "__oculab_aoi",
  eventType: "__oculab_event_type",
  fixationId: "__oculab_fixation_id",
  saccadeId: "__oculab_saccade_id",
  duration: "__oculab_duration",
  amplitude: "__oculab_amplitude",
  pupilLeft: "__oculab_pupil_left",
  pupilRight: "__oculab_pupil_right",
  timestamp: "__oculab_timestamp",
  sourceFile: "__oculab_source_file",
  sourceOrder: "__oculab_source_order",
};

const value = (row: RawRow, mapping: ColumnMap, key: keyof ColumnMap) => {
  const column = mapping[key];
  return column ? row[column] : null;
};

const text = (input: unknown) => input === null || input === undefined ? "" : String(input).trim();

const sameLabel = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

const numeric = (input: unknown) => {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const parsed = Number(text(input).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const convertDuration = (input: unknown, from: "ms" | "s", to: "ms" | "s") => {
  const parsed = numeric(input);
  if (parsed === null || from === to) return parsed;
  return from === "s" ? parsed * 1000 : parsed / 1000;
};

export function deriveSingleValue(rows: RawRow[], mapping: ColumnMap, key: "participant" | "group") {
  const values = Array.from(new Set(rows.map((row) => text(value(row, mapping, key))).filter(Boolean)));
  return values.length === 1 ? values[0] : "";
}

export function fileStem(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Participante";
}

export function normalizeBatchRows(datasets: BatchDatasetInput[], outputUnit: "ms" | "s", customVariables: CustomVariableConfig[] = []): RawRow[] {
  return datasets.flatMap((dataset, datasetIndex) => dataset.rows.map((row) => {
    const participant = text(dataset.participantOverride) || text(value(row, dataset.mapping, "participant")) || fileStem(dataset.fileName);
    const group = text(dataset.groupOverride) || text(value(row, dataset.mapping, "group")) || "Grupo não informado";
    const rawEventType = text(value(row, dataset.mapping, "eventType"));
    const normalizedEventType = sameLabel(rawEventType, dataset.fixationLabel ?? "Fixation")
      ? "Fixation"
      : sameLabel(rawEventType, dataset.saccadeLabel ?? "Saccade")
        ? "Saccade"
        : rawEventType;
    const customValues = Object.fromEntries(customVariables.map((variable) => {
      const sourceColumn = dataset.customMappings?.[variable.id];
      return [customRawColumn(variable.id), sourceColumn ? row[sourceColumn] : null];
    }));
    return {
      [batchMapping.participant!]: participant,
      [batchMapping.group!]: group,
      [batchMapping.moment!]: value(row, dataset.mapping, "moment"),
      [batchMapping.stimulus!]: dataset.mapping.stimulus ? value(row, dataset.mapping, "stimulus") : "Estímulo único",
      [batchMapping.trial!]: value(row, dataset.mapping, "trial"),
      [batchMapping.aoi!]: value(row, dataset.mapping, "aoi"),
      [batchMapping.eventType!]: normalizedEventType,
      [batchMapping.fixationId!]: value(row, dataset.mapping, "fixationId"),
      [batchMapping.saccadeId!]: value(row, dataset.mapping, "saccadeId"),
      [batchMapping.duration!]: convertDuration(value(row, dataset.mapping, "duration"), dataset.durationUnit, outputUnit),
      [batchMapping.amplitude!]: value(row, dataset.mapping, "amplitude"),
      [batchMapping.pupilLeft!]: value(row, dataset.mapping, "pupilLeft"),
      [batchMapping.pupilRight!]: value(row, dataset.mapping, "pupilRight"),
      [batchMapping.timestamp!]: value(row, dataset.mapping, "timestamp"),
      [batchMapping.sourceFile!]: dataset.fileName,
      [batchMapping.sourceOrder!]: datasetIndex + 1,
      ...customValues,
    };
  }));
}
