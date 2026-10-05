import { writeFile } from "node:fs/promises";
import XLSX from "xlsx";

import { processEyeData } from "../lib/eye/engine.ts";
import { buildExportWorkbookBytes, demoRows, suggestMapping } from "../lib/eye/io.ts";
import { batchMapping, normalizeBatchRows } from "../lib/eye/batch.ts";

const input = process.argv[3];
const sourceWorkbook = input ? XLSX.readFile(input, { raw: true }) : null;
const sourceRows = sourceWorkbook ? XLSX.utils.sheet_to_json(sourceWorkbook.Sheets[sourceWorkbook.SheetNames[0]], { defval: null, raw: true }) : demoRows;
const sourceMapping = suggestMapping(Object.keys(sourceRows[0]));
const rawDatasets = input ? [{ id: "real", fileName: "arquivo_real.xlsx", rows: sourceRows, mapping: sourceMapping, durationUnit: "ms" }] : [
  { id: "p01", fileName: "controle_P01.xlsx", rows: demoRows.filter((row) => row.Participante === "P01"), mapping: sourceMapping, participantOverride: "P01", groupOverride: "Controle", durationUnit: "s" },
  { id: "p02", fileName: "experimental_P02.xlsx", rows: demoRows.filter((row) => row.Participante === "P02"), mapping: sourceMapping, participantOverride: "P02", groupOverride: "Experimental", durationUnit: "s" },
];
const normalizedRows = normalizeBatchRows(rawDatasets, "ms");
const config = {
  mapping: batchMapping,
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
  moments: input ? [] : ["Pré-teste", "10h", "20h"],
  groupOrder: ["Controle", "Experimental"],
  groupAliases: {},
  metrics: { fixationCount: true, saccadeCount: true, fixationDuration: true, saccadeDuration: true, saccadicAmplitude: true, pupilLeft: false, pupilRight: false, pupilBinocular: true },
};

const output = process.argv[2];
if (!output) throw new Error("Informe o caminho do XLSX de saída.");
await writeFile(output, buildExportWorkbookBytes(processEyeData(normalizedRows, config), config, input ? "arquivo_real.xlsx" : "lote_2_arquivos"));
