import { customRawColumn } from "./custom.ts";
import type { AoiConfig, ColumnMap, CustomVariableConfig, RawRow } from "./types.ts";

export interface BatchDatasetInput {
  id: string;
  fileName: string;
  rows: RawRow[];
  mapping: ColumnMap;
  fixationLabel?: string;
  saccadeLabel?: string;
  customMappings?: Record<string, string>;
  aoiBinaryMappings?: Record<string, string>;
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
  gazeX: "__oculab_gaze_x",
  gazeY: "__oculab_gaze_y",
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

const isMarked = (input: unknown) => {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return Number.isFinite(input) && input !== 0;
  const normalized = text(input).toLocaleLowerCase();
  return ["1", "sim", "yes", "true", "inside", "hit", "dentro"].includes(normalized);
};

export function deriveSingleValue(rows: RawRow[], mapping: ColumnMap, key: "participant" | "group") {
  const values = Array.from(new Set(rows.map((row) => text(value(row, mapping, key))).filter(Boolean)));
  return values.length === 1 ? values[0] : "";
}

export function fileStem(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Participante";
}

const commonCoordinateFrames = [
  [640, 480], [800, 600], [1024, 768], [1280, 720], [1280, 800],
  [1366, 768], [1440, 900], [1600, 900], [1680, 1050], [1920, 1080],
  [1920, 1200], [2048, 1152], [2048, 1536], [2560, 1440], [2560, 1600],
  [3440, 1440], [3840, 2160], [4096, 2160],
] as const;

function inferCoordinateFrame(maxX: number, maxY: number, targetWidth: number, targetHeight: number) {
  const targetAspect = targetWidth > 0 && targetHeight > 0 ? targetWidth / targetHeight : maxX / Math.max(1, maxY);
  const eligible = commonCoordinateFrames.filter(([width, height]) => width >= maxX * 1.005 && height >= maxY * 1.005);
  if (!eligible.length) return { width: Math.max(1, maxX * 1.02), height: Math.max(1, maxY * 1.02) };
  const [width, height] = [...eligible].sort((left, right) => {
    const score = ([candidateWidth, candidateHeight]: readonly [number, number]) => {
      const aspectPenalty = Math.abs(Math.log((candidateWidth / candidateHeight) / targetAspect)) * 6;
      const areaPenalty = ((candidateWidth * candidateHeight) / Math.max(1, maxX * maxY) - 1) * 0.08;
      return aspectPenalty + areaPenalty;
    };
    return score(left) - score(right);
  })[0];
  return { width, height };
}

export function normalizeBatchRows(datasets: BatchDatasetInput[], outputUnit: "ms" | "s", customVariables: CustomVariableConfig[] = [], aoiConfig?: AoiConfig): RawRow[] {
  return datasets.flatMap((dataset, datasetIndex) => {
    const coordinatePairs = dataset.rows.flatMap((row) => {
      const x = numeric(value(row, dataset.mapping, "gazeX"));
      const y = numeric(value(row, dataset.mapping, "gazeY"));
      return x !== null && y !== null && x >= 0 && y >= 0 ? [{ x, y }] : [];
    });
    const maxX = Math.max(0, ...coordinatePairs.map((point) => point.x));
    const maxY = Math.max(0, ...coordinatePairs.map((point) => point.y));
    const coordinateSpace = aoiConfig?.coordinateSpace ?? "auto";
    const datasetIsNormalized = coordinatePairs.length > 0 && coordinatePairs.every((point) =>
      point.x <= 1 && point.y <= 1);
    const usesNormalizedCoordinates = coordinateSpace === "normalized"
      || (coordinateSpace === "auto" && datasetIsNormalized);
    let coordinateScaleX = usesNormalizedCoordinates && aoiConfig?.imageWidth ? aoiConfig.imageWidth : 1;
    let coordinateScaleY = usesNormalizedCoordinates && aoiConfig?.imageHeight ? aoiConfig.imageHeight : 1;

    if (
      coordinateSpace === "auto"
      && !usesNormalizedCoordinates
      && aoiConfig?.imageWidth
      && aoiConfig?.imageHeight
      && (maxX > aoiConfig.imageWidth * 1.01 || maxY > aoiConfig.imageHeight * 1.01)
    ) {
      const sourceFrame = inferCoordinateFrame(maxX, maxY, aoiConfig.imageWidth, aoiConfig.imageHeight);
      coordinateScaleX = aoiConfig.imageWidth / sourceFrame.width;
      coordinateScaleY = aoiConfig.imageHeight / sourceFrame.height;
    }

    return dataset.rows.map((row) => {
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
      const stimulus = dataset.mapping.stimulus ? value(row, dataset.mapping, "stimulus") : "Estímulo único";
      const x = numeric(value(row, dataset.mapping, "gazeX"));
      const y = numeric(value(row, dataset.mapping, "gazeY"));
      const scaledX = x === null ? null : x * coordinateScaleX;
      const scaledY = y === null ? null : y * coordinateScaleY;
      const labelAoi = text(value(row, dataset.mapping, "aoi"));
      const aoiNames = !aoiConfig?.enabled
        ? []
        : aoiConfig.mode === "labels"
          ? (labelAoi ? [labelAoi] : [])
          : aoiConfig.mode === "binary"
            ? aoiConfig.definitions.filter((definition) => {
              const column = dataset.aoiBinaryMappings?.[definition.id];
              return column ? isMarked(row[column]) : false;
            }).map((definition) => definition.name.trim()).filter(Boolean)
            : aoiConfig.definitions.filter((definition) => {
              if (scaledX === null || scaledY === null || definition.xMin === null || definition.yMin === null || definition.xMax === null || definition.yMax === null) return false;
              if (definition.stimulus.trim() && !sameLabel(text(stimulus), definition.stimulus.trim())) return false;
              return scaledX >= Math.min(definition.xMin, definition.xMax)
                && scaledX <= Math.max(definition.xMin, definition.xMax)
                && scaledY >= Math.min(definition.yMin, definition.yMax)
                && scaledY <= Math.max(definition.yMin, definition.yMax);
            }).map((definition) => definition.name.trim()).filter(Boolean);
      return {
        [batchMapping.participant!]: participant,
        [batchMapping.group!]: group,
        [batchMapping.moment!]: value(row, dataset.mapping, "moment"),
        [batchMapping.stimulus!]: stimulus,
        [batchMapping.trial!]: value(row, dataset.mapping, "trial"),
        [batchMapping.aoi!]: labelAoi,
        [batchMapping.eventType!]: normalizedEventType,
        [batchMapping.fixationId!]: value(row, dataset.mapping, "fixationId"),
        [batchMapping.saccadeId!]: value(row, dataset.mapping, "saccadeId"),
        [batchMapping.duration!]: convertDuration(value(row, dataset.mapping, "duration"), dataset.durationUnit, outputUnit),
        [batchMapping.amplitude!]: value(row, dataset.mapping, "amplitude"),
        [batchMapping.pupilLeft!]: value(row, dataset.mapping, "pupilLeft"),
        [batchMapping.pupilRight!]: value(row, dataset.mapping, "pupilRight"),
        [batchMapping.timestamp!]: value(row, dataset.mapping, "timestamp"),
        [batchMapping.gazeX!]: scaledX,
        [batchMapping.gazeY!]: scaledY,
        [batchMapping.sourceFile!]: dataset.fileName,
        [batchMapping.sourceOrder!]: datasetIndex + 1,
        __oculab_aoi_names: aoiNames,
        ...customValues,
      };
    });
  });
}
