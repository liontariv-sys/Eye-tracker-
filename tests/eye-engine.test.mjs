import assert from "node:assert/strict";
import test from "node:test";
import { processEyeData } from "../lib/eye/engine.ts";

const config = {
  mapping: {
    participant: "p",
    group: "g",
    moment: "m",
    stimulus: "media",
    eventType: "event",
    fixationId: "fix",
    saccadeId: "sac",
    duration: "duration",
    amplitude: "amplitude",
    pupilLeft: "left",
    pupilRight: "right",
  },
  studyDesign: "longitudinal",
  outputLayout: "both",
  fixationLabel: "Fixation",
  saccadeLabel: "Saccade",
  durationUnit: "s",
  outputDurationUnit: "ms",
  amplitudeSource: "auto",
  finalWeighting: "stimulus",
  countAggregation: "mean",
  excludeMissingStimulus: true,
  outputSheets: { eventTrace: true, stimulusSummary: true, participantSummary: true, analysisMatrix: true },
  moments: ["pre", "post"],
  groupOrder: ["controle"],
  groupAliases: {},
  metrics: {
    fixationCount: true,
    saccadeCount: true,
    fixationDuration: true,
    saccadeDuration: true,
    saccadicAmplitude: true,
    pupilLeft: true,
    pupilRight: true,
    pupilBinocular: true,
  },
};

test("sanitiza pupila antes da média e converte segundos em ms", () => {
  const rows = [
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 1, duration: 0.4, left: 3.2, right: 0 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 1, duration: 0.4, left: 3.4, right: 3.1 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Saccade", sac: 1, duration: 0.05, amplitude: 4.2 },
  ];
  const result = processEyeData(rows, config);
  assert.equal(result.level1[0].Duracao_Fixacao, 400);
  assert.equal(result.level1[0].Pupila_Esquerda, 3.3);
  assert.equal(result.level1[0].Pupila_Direita, 3.1);
  assert.equal(result.summary.invalidPupilValues, 1);
});

test("pareia apenas a sacada imediatamente posterior e não a reutiliza", () => {
  const rows = [
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 1, duration: 0.2 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 2, duration: 0.3 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Saccade", sac: 1, duration: 0.04, amplitude: 3.5 },
  ];
  const result = processEyeData(rows, config);
  assert.equal(result.level1[0].Sacada_ID, "");
  assert.equal(result.level1[1].Sacada_ID, "1");
  assert.equal(result.summary.pairedEvents, 1);
});

test("mantém na coluna de duração todas as sacadas válidas, mesmo sem pareamento", () => {
  const rows = [
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Saccade", sac: 1, duration: 0.01 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Saccade", sac: 2, duration: 0.02 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 1, duration: 0.1 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Saccade", sac: 3, duration: 0.03 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Unclassified", duration: 0.99 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 2, duration: 0.2 },
  ];
  const result = processEyeData(rows, config);
  assert.deepEqual(result.level1.map((row) => row.Duracao_Sacada), [10, 20, 30, null]);
  assert.deepEqual(result.level1.map((row) => row.Duracao_Fixacao), [null, null, 100, 200]);
  assert.equal(result.level1[0].N_Fixacoes, 2);
  assert.equal(result.level1[0].N_Sacadas, 3);
  assert.equal(result.byStimulus[0].N_Fixacoes, 2);
  assert.equal(result.byStimulus[0].N_Sacadas, 3);
  assert.equal(result.byStimulus[0].Duracao_Sacada_Media, 20);
  assert.equal(result.summary.pairedEvents, 1);
});

test("preserva momentos ausentes e gera matriz ampla", () => {
  const rows = [
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 1, duration: 0.2 },
  ];
  const result = processEyeData(rows, config);
  assert.equal(result.level2.length, 2);
  assert.equal(result.level2[1].Momento, "post");
  assert.equal(result.level2[1].N_Fixacoes, null);
  assert.equal(result.level2Wide.length, 1);
  assert.ok("N_Fixacoes_post" in result.level2Wide[0]);
});

test("detecta amplitude armazenada nas linhas de fixação", () => {
  const rows = [
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 1, duration: 0.2, amplitude: 2.75 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Saccade", sac: 1, duration: 0.04 },
  ];
  const result = processEyeData(rows, config);
  assert.equal(result.level1[0].Amplitude_Sacadica, 2.75);
  assert.equal(result.summary.resolvedAmplitudeSource, "fixation");
});

test("reproduz a síntese com peso igual por estímulo", () => {
  const rows = [
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 1, duration: 0.1 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 2, duration: 0.1 },
    { p: "P1", g: "controle", m: "pre", media: "B", event: "Fixation", fix: 3, duration: 1 },
  ];
  const result = processEyeData(rows, config);
  assert.equal(result.byStimulus.length, 2);
  assert.equal(result.level2[0].Duracao_Fixacao_Media, 550);
  assert.equal(result.level2[0].N_Fixacoes, 1.5);
  assert.equal(result.level2[0].N_Estimulos, 2);
});

test("ignora eventos sem estímulo quando configurado", () => {
  const rows = [
    { p: "P1", g: "controle", m: "pre", media: "", event: "Fixation", fix: 1, duration: 0.1 },
    { p: "P1", g: "controle", m: "pre", media: "A", event: "Fixation", fix: 2, duration: 0.2 },
  ];
  const result = processEyeData(rows, config);
  assert.equal(result.level1.length, 1);
  assert.equal(result.summary.excludedMissingStimulusRows, 1);
});
