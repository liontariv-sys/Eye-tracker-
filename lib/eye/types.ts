export type RawRow = Record<string, unknown>;

export type FieldKey =
  | "participant"
  | "group"
  | "moment"
  | "stimulus"
  | "trial"
  | "aoi"
  | "eventType"
  | "fixationId"
  | "saccadeId"
  | "duration"
  | "amplitude"
  | "pupilLeft"
  | "pupilRight"
  | "timestamp"
  | "sourceFile"
  | "sourceOrder";

export type ColumnMap = Partial<Record<FieldKey, string>>;

export type MetricKey =
  | "fixationCount"
  | "saccadeCount"
  | "fixationDuration"
  | "saccadeDuration"
  | "saccadicAmplitude"
  | "pupilLeft"
  | "pupilRight"
  | "pupilBinocular";

export type CustomAggregation = "mean" | "sum" | "min" | "max" | "count";

export interface CustomVariableConfig {
  id: string;
  label: string;
  aggregation: CustomAggregation;
  eventKind: "fixation" | "saccade" | "both";
  column: string;
}

export interface EngineConfig {
  mapping: ColumnMap;
  contextFields?: Partial<Record<"participant" | "group" | "moment" | "stimulus" | "trial" | "aoi" | "sourceFile", boolean>>;
  studyDesign: "cross-sectional" | "longitudinal";
  outputLayout: "long" | "wide" | "both";
  fixationLabel: string;
  saccadeLabel: string;
  durationUnit: "ms" | "s";
  outputDurationUnit: "ms" | "s";
  amplitudeSource: "auto" | "fixation" | "saccade";
  finalWeighting: "stimulus" | "event";
  countAggregation: "mean" | "sum";
  excludeMissingStimulus: boolean;
  outputSheets: {
    eventTrace: boolean;
    stimulusSummary: boolean;
    participantSummary: boolean;
    analysisMatrix: boolean;
  };
  moments: string[];
  groupOrder: string[];
  groupAliases: Record<string, string>;
  metrics: Record<MetricKey, boolean>;
  customVariables?: CustomVariableConfig[];
}

export interface Level1Row {
  [key: string]: string | number | boolean | null;
  Arquivo: string;
  Ordem_Arquivo: number;
  Participante: string;
  Grupo: string;
  Momento: string;
  Estimulo: string;
  Tentativa: string;
  AOI: string;
  N_Fixacoes: number | ".";
  N_Sacadas: number | ".";
  Fixacao_ID: string;
  Duracao_Fixacao: number | null;
  Sacada_ID: string;
  Duracao_Sacada: number | null;
  Sacada_Emparelhada: boolean;
  Amplitude_Sacadica: number | null;
  Pupila_Esquerda: number | null;
  Pupila_Direita: number | null;
  Pupila_Binocular: number | null;
  Linha_Inicial_Fixacao: number | null;
  Linha_Inicial_Sacada: number | null;
  Linha_Ordem_Evento: number;
}

export type Level2Row = Record<string, string | number | null>;

export interface AuditItem {
  status: "ok" | "warning" | "error";
  test: string;
  detail: string;
}

export interface ProcessResult {
  level1: Level1Row[];
  level2: Level2Row[];
  level2Wide: Level2Row[];
  byStimulus: Level2Row[];
  audit: AuditItem[];
  summary: {
    rawRows: number;
    fixationEvents: number;
    saccadeEvents: number;
    pairedEvents: number;
    invalidPupilValues: number;
    participants: number;
    expectedLongitudinalRows: number;
    excludedMissingStimulusRows: number;
    resolvedAmplitudeSource: "fixation" | "saccade";
    sourceFiles: number;
  };
}
