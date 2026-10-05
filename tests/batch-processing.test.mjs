import assert from "node:assert/strict";
import test from "node:test";
import { batchMapping, normalizeBatchRows } from "../lib/eye/batch.ts";
import { processEyeData } from "../lib/eye/engine.ts";
import { customEventKey, customRawColumn, customSummaryKey } from "../lib/eye/custom.ts";

const metrics = {
  fixationCount: true,
  saccadeCount: true,
  fixationDuration: true,
  saccadeDuration: true,
  saccadicAmplitude: true,
  pupilLeft: false,
  pupilRight: false,
  pupilBinocular: false,
};

const config = {
  mapping: batchMapping,
  studyDesign: "cross-sectional",
  outputLayout: "both",
  fixationLabel: "Fixation",
  saccadeLabel: "Saccade",
  durationUnit: "ms",
  outputDurationUnit: "ms",
  amplitudeSource: "auto",
  finalWeighting: "stimulus",
  countAggregation: "mean",
  excludeMissingStimulus: true,
  outputSheets: { eventTrace: true, stimulusSummary: true, participantSummary: true, analysisMatrix: true },
  moments: [],
  groupOrder: ["Controle", "Experimental"],
  groupAliases: {},
  metrics,
};

test("normaliza formatos diferentes e consolida grupo na fase estatística", () => {
  const datasets = [
    {
      id: "controle",
      fileName: "controle.xlsx",
      durationUnit: "s",
      participantOverride: "P01",
      groupOverride: "Controle",
      mapping: { eventType: "evento", fixationId: "fix", saccadeId: "sac", duration: "tempo", stimulus: "slide" },
      rows: [
        { evento: "Fixation", fix: 1, tempo: 0.4, slide: "A" },
        { evento: "Saccade", sac: 1, tempo: 0.05, slide: "A" },
      ],
    },
    {
      id: "experimental",
      fileName: "experimental.csv",
      durationUnit: "ms",
      participantOverride: "P02",
      groupOverride: "Experimental",
      mapping: { eventType: "GazeEventType", fixationId: "FixationIndex", duration: "GazeEventDuration", stimulus: "MediaName" },
      rows: [{ GazeEventType: "Fixation", FixationIndex: 1, GazeEventDuration: 250, MediaName: "B" }],
    },
  ];
  const normalized = normalizeBatchRows(datasets, "ms");
  const result = processEyeData(normalized, config);
  assert.equal(result.summary.sourceFiles, 2);
  assert.equal(result.summary.participants, 2);
  assert.deepEqual(result.level1.map((row) => row.Arquivo), ["controle.xlsx", "experimental.csv"]);
  assert.equal(result.level1[0].Duracao_Fixacao, 400);
  assert.deepEqual(result.level2.map((row) => row.Grupo), ["Controle", "Experimental"]);
});

test("a ordem do lote controla a separação das fases 1 e 2", () => {
  const base = [
    { id: "a", fileName: "A.xlsx", durationUnit: "ms", participantOverride: "P1", groupOverride: "G", mapping: { eventType: "e", fixationId: "i", duration: "d", stimulus: "s" }, rows: [{ e: "Fixation", i: 1, d: 100, s: "A" }] },
    { id: "b", fileName: "B.xlsx", durationUnit: "ms", participantOverride: "P2", groupOverride: "G", mapping: { eventType: "e", fixationId: "i", duration: "d", stimulus: "s" }, rows: [{ e: "Fixation", i: 1, d: 200, s: "B" }] },
  ];
  const result = processEyeData(normalizeBatchRows([...base].reverse(), "ms"), config);
  assert.equal(result.level1[0].Arquivo, "B.xlsx");
  assert.equal(result.byStimulus[0].Arquivo, "B.xlsx");
  assert.deepEqual(result.level2.map((row) => row.Participante), ["P2", "P1"]);
  assert.deepEqual(result.level2Wide.map((row) => row.Participante), ["P2", "P1"]);
});

test("arquivo sem coluna de estímulo continua elegível", () => {
  const datasets = [{ id: "sem-estimulo", fileName: "participante.xlsx", durationUnit: "ms", participantOverride: "P03", groupOverride: "Controle", mapping: { eventType: "evento", fixationId: "fix", duration: "tempo" }, rows: [{ evento: "Fixation", fix: 1, tempo: 180 }] }];
  const result = processEyeData(normalizeBatchRows(datasets, "ms"), config);
  assert.equal(result.level1.length, 1);
  assert.equal(result.summary.excludedMissingStimulusRows, 0);
});

test("normaliza rótulos e colunas diferentes para uma variável adicional", () => {
  const variable = { id: "velocidade", label: "Velocidade do olhar", aggregation: "mean", eventKind: "saccade", column: customRawColumn("velocidade") };
  const datasets = [{
    id: "formato-alternativo",
    fileName: "alternativo.xlsx",
    durationUnit: "ms",
    participantOverride: "P04",
    groupOverride: "Grupo A",
    fixationLabel: "Fixação",
    saccadeLabel: "Sacada",
    customMappings: { velocidade: "vel_ocular" },
    mapping: { eventType: "classe", fixationId: "id_fix", saccadeId: "id_sac", duration: "tempo", stimulus: "cena" },
    rows: [
      { classe: "Fixação", id_fix: 1, tempo: 100, cena: "A", vel_ocular: null },
      { classe: "Sacada", id_sac: 1, tempo: 20, cena: "A", vel_ocular: 5 },
      { classe: "Fixação", id_fix: 2, tempo: 120, cena: "A", vel_ocular: null },
      { classe: "Sacada", id_sac: 2, tempo: 25, cena: "A", vel_ocular: 7 },
    ],
  }];
  const customConfig = { ...config, customVariables: [variable], groupOrder: ["Grupo A"] };
  const result = processEyeData(normalizeBatchRows(datasets, "ms", [variable]), customConfig);
  assert.deepEqual(result.level1.map((row) => row.Variavel_velocidade), [5, 7]);
  assert.equal(result.byStimulus[0][customSummaryKey("velocidade")], 6);
});

test("mantém a mesma variável separada entre fixações e sacadas", () => {
  const variable = { id: "comum", label: "Medida comum", aggregation: "mean", eventKind: "both", column: customRawColumn("comum") };
  const datasets = [{
    id: "ambos",
    fileName: "ambos.xlsx",
    durationUnit: "ms",
    participantOverride: "P05",
    groupOverride: "Grupo A",
    customMappings: { comum: "medida" },
    mapping: { eventType: "evento", fixationId: "fix", saccadeId: "sac", duration: "tempo", stimulus: "estimulo" },
    rows: [
      { evento: "Fixation", fix: 1, tempo: 100, estimulo: "A", medida: 10 },
      { evento: "Saccade", sac: 1, tempo: 20, estimulo: "A", medida: 20 },
      { evento: "Fixation", fix: 2, tempo: 120, estimulo: "A", medida: 30 },
      { evento: "Saccade", sac: 2, tempo: 25, estimulo: "A", medida: 40 },
    ],
  }];
  const bothConfig = { ...config, customVariables: [variable], groupOrder: ["Grupo A"] };
  const result = processEyeData(normalizeBatchRows(datasets, "ms", [variable]), bothConfig);
  assert.deepEqual(result.level1.map((row) => row[customEventKey("comum", "fixation")]), [10, 30]);
  assert.deepEqual(result.level1.map((row) => row[customEventKey("comum", "saccade")]), [20, 40]);
  assert.equal(result.byStimulus[0][customSummaryKey("comum", "fixation")], 20);
  assert.equal(result.byStimulus[0][customSummaryKey("comum", "saccade")], 30);
});
