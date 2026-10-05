import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";

import { processEyeData } from "../lib/eye/engine.ts";
import { buildExportWorkbookBytes, suggestMapping } from "../lib/eye/io.ts";
import { batchMapping, normalizeBatchRows } from "../lib/eye/batch.ts";
import { customRawColumn } from "../lib/eye/custom.ts";

const config = {
  mapping: { participant: "p", group: "g", moment: "m", stimulus: "media", eventType: "event", fixationId: "fix", saccadeId: "sac", duration: "duration" },
  studyDesign: "longitudinal",
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
  moments: ["pre", "post"],
  groupOrder: ["controle"],
  groupAliases: {},
  metrics: { fixationCount: true, saccadeCount: false, fixationDuration: true, saccadeDuration: false, saccadicAmplitude: false, pupilLeft: false, pupilRight: false, pupilBinocular: false },
};

test("gera XLSX estilizado, seletivo e com fase estatística explícita", () => {
  const rows = [
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 1, duration: 200 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 2, duration: 300 },
    { p: "P1", g: "controle", m: "pre", media: "B", event: "Fixation", fix: 3, duration: 400 },
  ];
  const result = processEyeData(rows, config);
  const bytes = buildExportWorkbookBytes(result, config, "teste.xlsx");
  const packageText = new TextDecoder().decode(bytes);

  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.match(packageText, /1_Eventos/);
  assert.match(packageText, /2_Resumo_estimulos/);
  assert.match(packageText, /3_SPSS_JASP_longo/);
  assert.match(packageText, /3_SPSS_JASP_amplo/);
  assert.match(packageText, /STDEV\.S/);
  assert.match(packageText, /FFF36D/);
  assert.doesNotMatch(packageText, /Pupila_Esquerda_Media/);
  assert.doesNotMatch(packageText, /Linha_Inicial_Fixacao/);
});

test("reconhece ParticipantName nas exportações Tobii", () => {
  assert.equal(suggestMapping(["ParticipantName", "GazeEventType"]).participant, "ParticipantName");
});

test("exporta uma variável adicional com o nome escolhido", () => {
  const variable = { id: "velocidade", label: "Velocidade do olhar", aggregation: "mean", eventKind: "both", column: customRawColumn("velocidade") };
  const customConfig = { ...config, studyDesign: "cross-sectional", moments: [], customVariables: [variable] };
  const rows = [
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 1, duration: 100, [variable.column]: 4.5 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Saccade", sac: 1, duration: 20, [variable.column]: 8.5 },
  ];
  const bytes = buildExportWorkbookBytes(processEyeData(rows, customConfig), customConfig, "personalizada.xlsx");
  const workbook = XLSX.read(bytes, { type: "array" });
  const phase1Headers = Object.keys(XLSX.utils.sheet_to_json(workbook.Sheets["1_Eventos"], { defval: null })[0]);
  const phase2Headers = Object.keys(XLSX.utils.sheet_to_json(workbook.Sheets["2_Resumo_estimulos"], { defval: null })[0]);
  assert.ok(phase1Headers.includes("Velocidade do olhar — fixações"));
  assert.ok(phase1Headers.includes("Velocidade do olhar — sacadas"));
  assert.ok(phase2Headers.includes("Velocidade do olhar — fixações"));
  assert.ok(phase2Headers.includes("Velocidade do olhar — sacadas"));
});

test("exporta sacadas não pareadas na coluna atual de duração", () => {
  const rows = [
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Saccade", sac: 1, duration: 10 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Saccade", sac: 2, duration: 20 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 1, duration: 100 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Saccade", sac: 3, duration: 30 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Unclassified", duration: 999 },
  ];
  const exportConfig = {
    ...config,
    studyDesign: "cross-sectional",
    moments: [],
    metrics: { ...config.metrics, saccadeCount: true, saccadeDuration: true },
  };
  const bytes = buildExportWorkbookBytes(processEyeData(rows, exportConfig), exportConfig, "sacadas.xlsx");
  const workbook = XLSX.read(bytes, { type: "array" });
  const exported = XLSX.utils.sheet_to_json(workbook.Sheets["1_Eventos"], { defval: null });
  assert.deepEqual(exported.map((row) => row["Duração da sacada (ms)"]).filter((value) => typeof value === "number"), [10, 20, 30]);
  assert.equal(exported[0]["Nº de sacadas"], 3);
});

test("exporta vários arquivos em blocos e leva o grupo para SPSS/JASP", () => {
  const datasets = [
    { id: "1", fileName: "controle.xlsx", durationUnit: "ms", participantOverride: "P01", groupOverride: "Controle", mapping: { eventType: "e", fixationId: "i", duration: "d", stimulus: "s" }, rows: [{ e: "Fixation", i: 1, d: 200, s: "A" }] },
    { id: "2", fileName: "experimental.xlsx", durationUnit: "ms", participantOverride: "P02", groupOverride: "Experimental", mapping: { eventType: "e", fixationId: "i", duration: "d", stimulus: "s" }, rows: [{ e: "Fixation", i: 1, d: 300, s: "B" }] },
  ];
  const batchConfig = { ...config, mapping: batchMapping, contextFields: { sourceFile: true, participant: true, group: true, moment: false, stimulus: true, trial: false, aoi: false }, studyDesign: "cross-sectional", moments: [], groupOrder: ["Controle", "Experimental"] };
  const bytes = buildExportWorkbookBytes(processEyeData(normalizeBatchRows(datasets, "ms"), batchConfig), batchConfig, "lote_2_arquivos");
  const packageText = new TextDecoder().decode(bytes);
  assert.match(packageText, /Arquivo de origem/);
  assert.match(packageText, /controle\.xlsx/);
  assert.match(packageText, /experimental\.xlsx/);
  assert.match(packageText, /Experimental/);
});
