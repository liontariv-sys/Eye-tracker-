"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  FileCheck2,
  Gauge,
  GripVertical,
  Layers3,
  LogOut,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sigma,
  Sparkles,
  TableProperties,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Bar, BarChart, Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { detectDurationUnit, detectEventLabels, exportWorkbook, demoRows, readDataFile, suggestMapping } from "@/lib/eye/io";
import { processEyeData } from "@/lib/eye/engine";
import { batchMapping, deriveSingleValue, fileStem, normalizeBatchRows } from "@/lib/eye/batch";
import { customEventKey, customOutputLabel, customOutputScopes, customRawColumn, customSdKey, customSummaryKey } from "@/lib/eye/custom";
import type { ColumnMap, CustomAggregation, CustomVariableConfig, EngineConfig, FieldKey, MetricKey, ProcessResult, RawRow } from "@/lib/eye/types";

type WorkbookSheet = { name: string; rows: RawRow[]; headers: string[] };
type UploadedDataset = {
  id: string;
  fileName: string;
  sheetName: string;
  sheets: WorkbookSheet[];
  rows: RawRow[];
  headers: string[];
  mapping: ColumnMap;
  fixationLabel: string;
  saccadeLabel: string;
  customMappings: Record<string, string>;
  participantOverride: string;
  groupOverride: string;
  durationUnit: "ms" | "s";
  durationDetection: "ms" | "s" | null;
};

const mappingFields: Array<{ key: FieldKey; label: string; hint: string; required?: boolean }> = [
  { key: "participant", label: "Participante", hint: "Identificador do sujeito" },
  { key: "group", label: "Grupo", hint: "Condição ou grupo experimental" },
  { key: "moment", label: "Momento", hint: "Etapa ou ocasião da coleta" },
  { key: "stimulus", label: "Estímulo", hint: "Mídia, cena ou tarefa" },
  { key: "trial", label: "Tentativa", hint: "Bloco ou repetição" },
  { key: "aoi", label: "Área de interesse", hint: "AOI, quando disponível" },
  { key: "eventType", label: "Tipo de evento", hint: "Coluna que classifica fixações e sacadas", required: true },
  { key: "fixationId", label: "ID da fixação", hint: "Número ou código da fixação" },
  { key: "saccadeId", label: "ID da sacada", hint: "Número ou código da sacada" },
  { key: "duration", label: "Duração do evento", hint: "Tempo registrado para o evento" },
  { key: "amplitude", label: "Amplitude sacádica", hint: "Valor de amplitude da sacada" },
  { key: "pupilLeft", label: "Pupila esquerda", hint: "Medida do olho esquerdo" },
  { key: "pupilRight", label: "Pupila direita", hint: "Medida do olho direito" },
  { key: "timestamp", label: "Timestamp", hint: "Opcional; ordem das linhas é preservada" },
];

const metricFields: Array<{ key: MetricKey; label: string; detail: string }> = [
  { key: "fixationCount", label: "Número de fixações", detail: "Eventos únicos, não amostras" },
  { key: "saccadeCount", label: "Número de sacadas", detail: "Eventos únicos por estímulo" },
  { key: "fixationDuration", label: "Duração das fixações", detail: "Média e desvio-padrão" },
  { key: "saccadeDuration", label: "Duração das sacadas", detail: "Todas as sacadas válidas do estímulo" },
  { key: "saccadicAmplitude", label: "Amplitude sacádica", detail: "Origem automática ou definida pelo pesquisador" },
  { key: "pupilLeft", label: "Pupila esquerda", detail: "≤ 0 é convertido em ausente" },
  { key: "pupilRight", label: "Pupila direita", detail: "≤ 0 é convertido em ausente" },
  { key: "pupilBinocular", label: "Pupila binocular", detail: "Média dos olhos válidos" },
];

const defaultMetrics: Record<MetricKey, boolean> = {
  fixationCount: true,
  saccadeCount: true,
  fixationDuration: true,
  saccadeDuration: true,
  saccadicAmplitude: true,
  pupilLeft: false,
  pupilRight: false,
  pupilBinocular: false,
};

const steps = [
  { id: 1, label: "Importar dados", icon: UploadCloud },
  { id: 2, label: "Mapear colunas", icon: Layers3 },
  { id: 3, label: "Configurar análise", icon: Gauge },
  { id: 4, label: "Revisar resultados", icon: BarChart3 },
];

const chartMetricOptions: Array<{ key: string; metric: MetricKey; label: string; shortLabel: string; unit: (durationUnit: string) => string }> = [
  { key: "N_Fixacoes", metric: "fixationCount", label: "Número médio de fixações", shortLabel: "Fixações", unit: () => "eventos" },
  { key: "N_Sacadas", metric: "saccadeCount", label: "Número médio de sacadas", shortLabel: "Sacadas", unit: () => "eventos" },
  { key: "Duracao_Fixacao_Media", metric: "fixationDuration", label: "Duração média das fixações", shortLabel: "Duração da fixação", unit: (durationUnit) => durationUnit },
  { key: "Duracao_Sacada_Media", metric: "saccadeDuration", label: "Duração média das sacadas", shortLabel: "Duração da sacada", unit: (durationUnit) => durationUnit },
  { key: "Amplitude_Sacadica_Media", metric: "saccadicAmplitude", label: "Amplitude sacádica média", shortLabel: "Amplitude", unit: () => "graus" },
  { key: "Pupila_Esquerda_Media", metric: "pupilLeft", label: "Diâmetro médio da pupila esquerda", shortLabel: "Pupila esquerda", unit: () => "valor do arquivo" },
  { key: "Pupila_Direita_Media", metric: "pupilRight", label: "Diâmetro médio da pupila direita", shortLabel: "Pupila direita", unit: () => "valor do arquivo" },
  { key: "Pupila_Binocular_Media", metric: "pupilBinocular", label: "Diâmetro pupilar binocular médio", shortLabel: "Pupila binocular", unit: () => "valor do arquivo" },
];

const splitList = (value: string) => value.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean);

function DataTable({ rows, limit = 40, headerLabel }: { rows: Record<string, unknown>[]; limit?: number; headerLabel?: (header: string) => string }) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  if (!rows.length) return <div className="empty-state">Nenhum dado disponível nesta visão.</div>;
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead><tr>{headers.map((header) => <th key={header}>{headerLabel?.(header) ?? header.replaceAll("_", " ")}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, limit).map((row, index) => (
            <tr key={index}>{headers.map((header) => <td key={header}>{row[header] === null || row[header] === undefined || row[header] === "" ? <span className="missing">—</span> : String(row[header])}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit && <div className="table-foot">Prévia de {limit} de {rows.length} linhas. O arquivo exportado contém todas.</div>}
    </div>
  );
}

export default function OculabWorkspace({ isAdmin = false }: { isAdmin?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const presetInput = useRef<HTMLInputElement>(null);
  const pointerDragId = useRef<string | null>(null);
  const [step, setStep] = useState(1);
  const [datasets, setDatasets] = useState<UploadedDataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState("");
  const [metrics, setMetrics] = useState(defaultMetrics);
  const [customVariables, setCustomVariables] = useState<CustomVariableConfig[]>([]);
  const [outputDurationUnit, setOutputDurationUnit] = useState<"ms" | "s">("ms");
  const [amplitudeSource, setAmplitudeSource] = useState<"auto" | "fixation" | "saccade">("auto");
  const [finalWeighting, setFinalWeighting] = useState<"stimulus" | "event">("stimulus");
  const [countAggregation, setCountAggregation] = useState<"mean" | "sum">("mean");
  const [excludeMissingStimulus, setExcludeMissingStimulus] = useState(true);
  const [outputSheets, setOutputSheets] = useState<EngineConfig["outputSheets"]>({ eventTrace: true, stimulusSummary: true, participantSummary: true, analysisMatrix: true });
  const [studyDesign, setStudyDesign] = useState<"cross-sectional" | "longitudinal">("longitudinal");
  const [outputLayout, setOutputLayout] = useState<"long" | "wide" | "both">("both");
  const [momentsText, setMomentsText] = useState("");
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [chartMetric, setChartMetric] = useState("Duracao_Fixacao_Media");
  const [error, setError] = useState("");

  const activeDataset = datasets.find((dataset) => dataset.id === activeDatasetId) ?? datasets[0];
  const rows = activeDataset?.rows ?? [];
  const headers = activeDataset?.headers ?? [];
  const mapping = activeDataset?.mapping ?? {};
  const totalRows = datasets.reduce((sum, dataset) => sum + dataset.rows.length, 0);
  const fileName = datasets.length === 1 ? fileStem(datasets[0].fileName) : `lote_${datasets.length}_arquivos`;
  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const requiredReady = Boolean(activeDataset?.mapping.eventType && activeDataset.fixationLabel.trim() && activeDataset.saccadeLabel.trim());
  const allMappingsReady = datasets.length > 0 && datasets.every((dataset) => dataset.mapping.eventType && dataset.fixationLabel.trim() && dataset.saccadeLabel.trim());
  const selectedMetricCount = Object.values(metrics).filter(Boolean).length + customVariables.length;
  const phase3Selected = Boolean(outputSheets.participantSummary || outputSheets.analysisMatrix);

  const makeDataset = (name: string, sheet: WorkbookSheet, sheets: WorkbookSheet[]): UploadedDataset => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const suggested = suggestMapping(sheet.headers);
    const detectedUnit = detectDurationUnit(sheet.rows, suggested);
    const eventLabels = detectEventLabels(sheet.rows, suggested);
    return {
      id,
      fileName: name,
      sheetName: sheet.name,
      sheets,
      rows: sheet.rows,
      headers: sheet.headers,
      mapping: suggested,
      fixationLabel: eventLabels.fixation,
      saccadeLabel: eventLabels.saccade,
      customMappings: {},
      participantOverride: deriveSingleValue(sheet.rows, suggested, "participant"),
      groupOverride: deriveSingleValue(sheet.rows, suggested, "group"),
      durationUnit: detectedUnit ?? "ms",
      durationDetection: detectedUnit,
    };
  };

  const patchDataset = (id: string, patch: Partial<UploadedDataset>) => {
    setDatasets((current) => current.map((dataset) => dataset.id === id ? { ...dataset, ...patch } : dataset));
    setResult(null);
  };

  const onFiles = async (files?: FileList | File[]) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    try {
      const additions = await Promise.all(selected.map(async (file) => {
        const parsed = await readDataFile(file);
        return makeDataset(file.name, parsed.sheets[0], parsed.sheets);
      }));
      setDatasets((current) => [...current, ...additions]);
      setActiveDatasetId((current) => current || additions[0].id);
      if (!datasets.length && additions.every((dataset) => !dataset.mapping.moment)) setStudyDesign("cross-sectional");
      const moments = additions.flatMap((dataset) => dataset.mapping.moment ? dataset.rows.map((row) => String(row[dataset.mapping.moment!] ?? "").trim()).filter(Boolean) : []);
      if (!momentsText && moments.length) setMomentsText(Array.from(new Set(moments)).join(", "));
      setResult(null);
      setError("");
      if (fileInput.current) fileInput.current.value = "";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o arquivo.");
    }
  };

  const useDemo = () => {
    const demoHeaders = Object.keys(demoRows[0]);
    const participants = Array.from(new Set(demoRows.map((row) => String(row.Participante))));
    const demoDatasets = participants.map((participant) => {
      const participantRows = demoRows.filter((row) => row.Participante === participant);
      const sheet = { name: "Dados brutos", rows: participantRows, headers: demoHeaders };
      return makeDataset(`exemplo_${participant}.xlsx`, sheet, [sheet]);
    });
    setDatasets(demoDatasets);
    setActiveDatasetId(demoDatasets[0].id);
    setMomentsText("Momento 1, Momento 2");
    setResult(null);
    setError("");
  };

  const removeDataset = (id: string) => {
    setDatasets((current) => current.filter((dataset) => dataset.id !== id));
    if (activeDatasetId === id) setActiveDatasetId(datasets.find((dataset) => dataset.id !== id)?.id ?? "");
    setResult(null);
  };

  const moveDataset = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setDatasets((current) => {
      const from = current.findIndex((dataset) => dataset.id === fromId);
      const to = current.findIndex((dataset) => dataset.id === toId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const nudgeDataset = (id: string, direction: -1 | 1) => {
    const index = datasets.findIndex((dataset) => dataset.id === id);
    const target = datasets[index + direction];
    if (target) moveDataset(id, target.id);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerDragId.current) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-dataset-id]");
    const targetId = target?.dataset.datasetId;
    if (targetId) moveDataset(pointerDragId.current, targetId);
  };

  const changeMapping = (field: FieldKey, selectedColumn: string) => {
    if (!activeDataset) return;
    const nextMapping = { ...activeDataset.mapping, [field]: selectedColumn === "__none__" ? undefined : selectedColumn };
    const eventLabels = field === "eventType" ? detectEventLabels(activeDataset.rows, nextMapping) : null;
    patchDataset(activeDataset.id, {
      mapping: nextMapping,
      ...(eventLabels ? { fixationLabel: eventLabels.fixation, saccadeLabel: eventLabels.saccade } : {}),
    });
  };

  const addCustomVariable = () => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setCustomVariables((current) => [...current, { id, label: `Variável adicional ${current.length + 1}`, aggregation: "mean", eventKind: "fixation", column: customRawColumn(id) }]);
    setResult(null);
  };

  const updateCustomVariable = (id: string, patch: Partial<CustomVariableConfig>) => {
    setCustomVariables((current) => current.map((variable) => variable.id === id ? { ...variable, ...patch } : variable));
    setResult(null);
  };

  const removeCustomVariable = (id: string) => {
    setCustomVariables((current) => current.filter((variable) => variable.id !== id));
    setDatasets((current) => current.map((dataset) => ({ ...dataset, customMappings: Object.fromEntries(Object.entries(dataset.customMappings).filter(([key]) => key !== id)) })));
    setResult(null);
  };

  const normalizedRows = useMemo(() => normalizeBatchRows(datasets, outputDurationUnit, customVariables), [datasets, outputDurationUnit, customVariables]);
  const batchGroups = useMemo(() => Array.from(new Set(datasets.flatMap((dataset) => {
    if (dataset.groupOverride.trim()) return [dataset.groupOverride.trim()];
    if (!dataset.mapping.group) return [];
    return dataset.rows.map((row) => String(row[dataset.mapping.group!] ?? "").trim()).filter(Boolean);
  }))), [datasets]);

  const config = useMemo<EngineConfig>(() => ({
    mapping: batchMapping,
    contextFields: {
      sourceFile: datasets.length > 1,
      participant: true,
      group: true,
      moment: datasets.some((dataset) => Boolean(dataset.mapping.moment)),
      stimulus: datasets.some((dataset) => Boolean(dataset.mapping.stimulus)),
      trial: datasets.some((dataset) => Boolean(dataset.mapping.trial)),
      aoi: datasets.some((dataset) => Boolean(dataset.mapping.aoi)),
    },
    studyDesign,
    outputLayout,
    fixationLabel: "Fixation",
    saccadeLabel: "Saccade",
    durationUnit: outputDurationUnit,
    outputDurationUnit,
    amplitudeSource,
    finalWeighting,
    countAggregation,
    excludeMissingStimulus,
    outputSheets,
    moments: splitList(momentsText),
    groupOrder: batchGroups,
    groupAliases: {},
    metrics,
    customVariables,
  }), [datasets, studyDesign, outputLayout, outputDurationUnit, amplitudeSource, finalWeighting, countAggregation, excludeMissingStimulus, outputSheets, momentsText, metrics, batchGroups, customVariables]);

  const run = () => {
    try {
      if (!selectedMetricCount) throw new Error("Selecione pelo menos uma variável para tabular.");
      if (!datasets.length) throw new Error("Adicione pelo menos um arquivo ao lote.");
      if (!allMappingsReady) throw new Error("Mapeie o tipo de evento em todos os arquivos do lote.");
      const duplicateNames = customVariables.map((variable) => variable.label.trim().toLocaleLowerCase()).filter((name, index, values) => !name || values.indexOf(name) !== index);
      if (duplicateNames.length) throw new Error("Dê um nome diferente e não vazio para cada variável adicional.");
      const unmappedCustom = customVariables.filter((variable) => !datasets.some((dataset) => dataset.customMappings[variable.id]));
      if (unmappedCustom.length) throw new Error(`Escolha uma coluna de origem para: ${unmappedCustom.map((variable) => variable.label).join(", ")}.`);
      if (!outputSheets.eventTrace && !outputSheets.stimulusSummary && !phase3Selected) throw new Error("Selecione pelo menos uma fase para incluir no Excel.");
      const participantGroups = new Map<string, Set<string>>();
      for (const row of normalizedRows) {
        const participant = String(row[batchMapping.participant!] ?? "");
        const group = String(row[batchMapping.group!] ?? "");
        participantGroups.set(participant, new Set([...(participantGroups.get(participant) ?? []), group]));
      }
      const inconsistent = [...participantGroups].filter(([, groups]) => groups.size > 1).map(([participant]) => participant);
      if (inconsistent.length) throw new Error(`Revise o grupo de ${inconsistent.join(", ")}: o mesmo participante aparece em mais de um grupo.`);
      setResult(processEyeData(normalizedRows, config));
      setError("");
      setStep(4);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao processar os dados.");
    }
  };

  const togglePhase3 = (checked: boolean) => setOutputSheets((current) => ({
    ...current,
    participantSummary: checked && outputLayout !== "wide",
    analysisMatrix: checked && outputLayout !== "long",
  }));

  const changeOutputLayout = (value: "long" | "wide" | "both") => {
    setOutputLayout(value);
    setOutputSheets((current) => ({
      ...current,
      participantSummary: value !== "wide",
      analysisMatrix: value !== "long",
    }));
  };

  const downloadPreset = () => {
    const blob = new Blob([JSON.stringify({ ...config, mapping: activeDataset?.mapping ?? {}, datasetSettings: activeDataset ? { fixationLabel: activeDataset.fixationLabel, saccadeLabel: activeDataset.saccadeLabel, customMappings: activeDataset.customMappings } : undefined }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lpnec-oculab-configuracao.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const loadPreset = async (file?: File) => {
    if (!file) return;
    try {
      const saved = JSON.parse(await file.text()) as Partial<EngineConfig> & { datasetSettings?: Partial<Pick<UploadedDataset, "fixationLabel" | "saccadeLabel" | "customMappings">> };
      if (saved.mapping && activeDataset) patchDataset(activeDataset.id, { mapping: saved.mapping, ...saved.datasetSettings });
      if (saved.metrics) setMetrics((current) => ({ ...current, ...saved.metrics }));
      if (saved.customVariables) setCustomVariables(saved.customVariables);
      if (saved.studyDesign) setStudyDesign(saved.studyDesign);
      if (saved.outputLayout) setOutputLayout(saved.outputLayout);
      if (saved.outputDurationUnit) setOutputDurationUnit(saved.outputDurationUnit);
      if (saved.amplitudeSource) setAmplitudeSource(saved.amplitudeSource);
      if (saved.finalWeighting) setFinalWeighting(saved.finalWeighting);
      if (saved.countAggregation) setCountAggregation(saved.countAggregation);
      if (typeof saved.excludeMissingStimulus === "boolean") setExcludeMissingStimulus(saved.excludeMissingStimulus);
      if (saved.outputSheets) setOutputSheets(saved.outputSheets);
      if (saved.moments) setMomentsText(saved.moments.join(", "));
      setError("");
    } catch {
      setError("O preset não é um arquivo de configuração válido do LPNeC Oculab.");
    }
  };

  const availableChartMetrics = useMemo(
    () => chartMetricOptions.filter((option) => metrics[option.metric]),
    [metrics],
  );
  const activeChartMetric = availableChartMetrics.find((option) => option.key === chartMetric) ?? availableChartMetrics[0];
  const eventTypeValues = useMemo(() => {
    if (!activeDataset?.mapping.eventType) return [];
    return Array.from(new Set(activeDataset.rows.slice(0, 25000).map((row) => String(row[activeDataset.mapping.eventType!] ?? "").trim()).filter(Boolean)));
  }, [activeDataset]);

  const friendlyHeader = (header: string) => {
    for (const variable of customVariables) {
      for (const scope of customOutputScopes(variable.eventKind)) {
        const outputScope = variable.eventKind === "both" ? scope : undefined;
        const label = customOutputLabel(variable.label, outputScope);
        const eventKey = customEventKey(variable.id, outputScope);
        const summaryKey = customSummaryKey(variable.id, outputScope);
        const deviationKey = customSdKey(variable.id, outputScope);
        if (header === eventKey) return label;
        if (header.startsWith(summaryKey)) return `${label}${header.slice(summaryKey.length).replaceAll("_", " ")}`;
        if (header.startsWith(deviationKey)) return `${label} DP${header.slice(deviationKey.length).replaceAll("_", " ")}`;
      }
    }
    return header.replaceAll("_", " ");
  };

  const chart = useMemo(() => {
    if (!result || !activeChartMetric) return { data: [], groups: [], moments: [], hasValues: false };
    const normalizedRows = result.level2.map((row) => ({
      ...row,
      __moment: String(row.Momento ?? "Momento único"),
      __group: String(row.Grupo ?? "Grupo não informado"),
    }));
    const groups = Array.from(new Set(normalizedRows.map((row) => row.__group)));
    const configuredMoments = splitList(momentsText);
    const moments = configuredMoments.length ? configuredMoments : Array.from(new Set(normalizedRows.map((row) => row.__moment)));
    const data = moments.map((moment) => {
      const item: Record<string, string | number | null> = { Momento: moment };
      for (const group of groups) {
        const values = normalizedRows
          .filter((row) => row.__moment === moment && row.__group === group)
          .map((row) => row[activeChartMetric.key])
          .filter((value): value is number => typeof value === "number");
        item[group] = values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
      }
      return item;
    });
    const hasValues = data.some((item) => groups.some((group) => typeof item[group] === "number"));
    return { data, groups, moments, hasValues };
  }, [result, momentsText, activeChartMetric]);

  const showLineChart = studyDesign === "longitudinal" && chart.moments.length > 1;

  const colors = ["#159a91", "#59c777", "#ff7e5f", "#0c1d2a", "#66a8a2", "#9a6a60"];

  const level1Preview = useMemo(() => {
    if (!result) return [];
    const structural = new Set([
      "Arquivo",
      "Participante",
      "Grupo",
      ...(datasets.some((dataset) => dataset.mapping.moment) ? ["Momento"] : []),
      ...(datasets.some((dataset) => dataset.mapping.stimulus) ? ["Estimulo"] : []),
      ...(datasets.some((dataset) => dataset.mapping.trial) ? ["Tentativa"] : []),
      ...(datasets.some((dataset) => dataset.mapping.aoi) ? ["AOI"] : []),
    ]);
    const metricVisible = (key: string) =>
      (key.startsWith("N_Fixacoes") && metrics.fixationCount) ||
      (key.startsWith("N_Sacadas") && metrics.saccadeCount) ||
      (key.startsWith("Duracao_Fixacao") && metrics.fixationDuration) ||
      (key.startsWith("Duracao_Sacada") && metrics.saccadeDuration) ||
      (key.startsWith("Amplitude_Sacadica") && metrics.saccadicAmplitude) ||
      (key.startsWith("Pupila_Esquerda") && metrics.pupilLeft) ||
      (key.startsWith("Pupila_Direita") && metrics.pupilRight) ||
      (key.startsWith("Pupila_Binocular") && metrics.pupilBinocular) ||
      customVariables.some((variable) => key.startsWith(customEventKey(variable.id)));
    return result.level1.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => structural.has(key) || metricVisible(key))));
  }, [result, datasets, metrics, customVariables]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="lpnec-logo-crop">
            {/* A imagem é servida diretamente para preservar o PNG transparente no build do Site. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/lpnec-logo-transparent.png" alt="LPNeC" />
          </div>
          <div className="brand-copy"><strong>LPNeC <span>Oculab</span></strong><small>Percepção · Neurociências · UFPB</small></div>
        </div>
        <nav aria-label="Etapas da tabulação">
          {steps.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => id <= (datasets.length ? 4 : 1) && setStep(id)} className={step === id ? "step active" : "step"} disabled={id > 1 && !datasets.length}>
              <span className="step-icon">{id < step ? <Check size={17} /> : <Icon size={17} />}</span>
              <span className="step-copy"><small>Etapa {String(id).padStart(2, "0")}</small><strong>{label}</strong></span>
              {step === id && <ChevronRight size={16} className="step-arrow" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={18} />
          <div><strong>Processamento local</strong><p>Os dados permanecem neste dispositivo.</p></div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-heading">
            <span className="topbar-step" aria-hidden="true">{String(step).padStart(2, "0")}</span>
            <div>
              <p className="eyebrow">Laboratório de Percepção, Neurociências e Comportamento · UFPB</p>
              <h1>{steps[step - 1].label}</h1>
            </div>
          </div>
          <nav className="topbar-actions" aria-label="Ações da conta">
            {isAdmin && <a className="admin-shortcut" href="/admin" aria-label="Gerenciar acessos" title="Gerenciar acessos"><ShieldCheck aria-hidden="true" /><span>Acessos</span></a>}
            {datasets.length > 0 && <div className="file-pill"><FileSpreadsheet size={17} /><div><strong>{datasets.length} {datasets.length === 1 ? "arquivo no lote" : "arquivos no lote"}</strong><span>{totalRows.toLocaleString("pt-BR")} linhas brutas · ordem editável</span></div></div>}
            <a className="signout-shortcut" href="/logout" target="_top" aria-label="Sair do Oculab" title="Sair do Oculab"><LogOut aria-hidden="true" /><span>Sair</span></a>
          </nav>
        </header>

        {error && <div className="error-banner" role="alert"><CircleAlert size={19} /><span>{error}</span><button onClick={() => setError("")}>Fechar</button></div>}

        {step === 1 && (
          <section className="stage import-stage">
            <div className="welcome-panel">
              <div className="welcome-copy"><h2>Do dado bruto à planilha pronta para pesquisa.</h2><p>O LPNeC Oculab organiza arquivos de eye tracking, calcula apenas as variáveis que você escolher e entrega um Excel claro para revisão ou análise estatística.</p></div>
              <div className="welcome-outcome"><span><FileCheck2 /></span><div><strong>Você escolhe o que entra.</strong><p>Formatos, variáveis e estrutura final se adaptam ao desenho do estudo.</p></div></div>
            </div>
            <button className="dropzone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void onFiles(event.dataTransfer.files); }}>
              <span className="upload-orbit"><UploadCloud size={30} /></span>
              <strong>Selecione uma ou várias planilhas brutas</strong>
              <span>Excel, CSV, TSV ou OpenDocument · todos os arquivos entram no mesmo lote</span>
              <input ref={fileInput} type="file" multiple accept=".csv,.tsv,.xls,.xlsx,.xlsm,.xlsb,.ods" hidden onChange={(event) => void onFiles(event.target.files ?? undefined)} />
            </button>
            {datasets.length > 0 && <div className="batch-panel">
              <div className="batch-heading"><div><Badge>{datasets.length}</Badge><div><strong>{datasets.length === 1 ? "arquivo anexado" : "arquivos anexados"}</strong><span>Defina participante e grupo. Arraste a alça para escolher a ordem no Excel.</span></div></div><Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}><UploadCloud /> Adicionar arquivos</Button></div>
              <div className="file-queue">
                {datasets.map((dataset, index) => (
                  <div className="file-queue-item" data-dataset-id={dataset.id} key={dataset.id} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (pointerDragId.current) moveDataset(pointerDragId.current, dataset.id); pointerDragId.current = null; }}>
                    <button className="file-drag-handle" aria-label={`Arrastar ${dataset.fileName}`} title="Pressione e arraste para reordenar" draggable onDragStart={() => { pointerDragId.current = dataset.id; }} onDragEnd={() => { pointerDragId.current = null; }} onPointerDown={(event) => { pointerDragId.current = dataset.id; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={handlePointerMove} onPointerUp={() => { pointerDragId.current = null; }} onPointerCancel={() => { pointerDragId.current = null; }}><GripVertical /><span>{index + 1}</span></button>
                    <div className="file-queue-main">
                      <div className="file-queue-title"><FileSpreadsheet /><div><strong>{dataset.fileName}</strong><span>{dataset.rows.length.toLocaleString("pt-BR")} linhas · {dataset.sheetName}</span></div><Badge variant={dataset.mapping.eventType ? "outline" : "secondary"}>{dataset.mapping.eventType ? "colunas reconhecidas" : "revisar colunas"}</Badge></div>
                      <div className="file-metadata-grid">
                        <div><Label htmlFor={`participant-${dataset.id}`}>Participante</Label><Input id={`participant-${dataset.id}`} value={dataset.participantOverride} onChange={(event) => patchDataset(dataset.id, { participantOverride: event.target.value })} placeholder={dataset.mapping.participant ? `Vazio = usar ${dataset.mapping.participant}` : `Vazio = usar ${fileStem(dataset.fileName)}`} /></div>
                        <div><Label htmlFor={`group-${dataset.id}`}>Grupo</Label><Input id={`group-${dataset.id}`} list="oculab-groups" value={dataset.groupOverride} onChange={(event) => patchDataset(dataset.id, { groupOverride: event.target.value })} placeholder={dataset.mapping.group ? `Vazio = usar ${dataset.mapping.group}` : "Ex.: Controle ou Experimental"} /><small>Será a variável Grupo na fase 3.</small></div>
                        <div><Label>Unidade da duração</Label><Select value={dataset.durationUnit} onValueChange={(value) => patchDataset(dataset.id, { durationUnit: value as "ms" | "s" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ms">Milissegundos</SelectItem><SelectItem value="s">Segundos</SelectItem></SelectContent></Select>{dataset.durationDetection && <small>detectada: {dataset.durationDetection}</small>}</div>
                      </div>
                    </div>
                    <div className="file-queue-actions"><Button variant="ghost" size="icon" onClick={() => nudgeDataset(dataset.id, -1)} disabled={index === 0} aria-label="Mover para cima"><ArrowUp /></Button><Button variant="ghost" size="icon" onClick={() => nudgeDataset(dataset.id, 1)} disabled={index === datasets.length - 1} aria-label="Mover para baixo"><ArrowDown /></Button><Button variant="ghost" size="icon" className="remove-file" onClick={() => removeDataset(dataset.id)} aria-label="Remover arquivo"><Trash2 /></Button></div>
                  </div>
                ))}
              </div>
              <datalist id="oculab-groups">{Array.from(new Set(["Grupo controle", "Grupo experimental", ...batchGroups])).map((group) => <option value={group} key={group} />)}</datalist>
              <div className="batch-footer"><span>A ordem acima será repetida nas fases 1 e 2. A fase 3 reunirá todos os participantes em uma única base.</span><Button onClick={() => { setActiveDatasetId(datasets[0].id); setStep(2); }}>Mapear colunas <ChevronRight /></Button></div>
            </div>}
            <div className="demo-row"><div><Sparkles size={17} /><span><strong>Primeira vez aqui?</strong> Teste um lote com dois participantes sem precisar de arquivo próprio.</span></div><Button variant="outline" onClick={useDemo}>Usar lote de exemplo</Button></div>
            <div className="journey-title"><span>Um lote, três entregas</span><p>Cada fase reúne os arquivos sem perder a origem de cada resultado.</p></div>
            <div className="product-journey">
              <div><span className="journey-number">1</span><TableProperties /><strong>Rastreio organizado</strong><p>Eventos separados por estímulo e somente com as variáveis escolhidas.</p></div>
              <div><span className="journey-number">2</span><Sigma /><strong>Resumo dos estímulos</strong><p>Totais, médias e desvios-padrão prontos para conferir.</p></div>
              <div><span className="journey-number">3</span><BarChart3 /><strong>Base para SPSS/JASP</strong><p>Dados longos ou amplos, com ausências preservadas corretamente.</p></div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="stage">
            <div className="stage-toolbar"><div><h2>Mapeamento por arquivo</h2><p>Relacione cada informação à coluna correspondente. Os menus mostram os nomes reais encontrados em cada planilha.</p></div><Badge variant={allMappingsReady ? "default" : "secondary"}>{datasets.filter((dataset) => dataset.mapping.eventType && dataset.fixationLabel.trim() && dataset.saccadeLabel.trim()).length} de {datasets.length} arquivos prontos</Badge></div>
            <div className="dataset-tabs" role="tablist" aria-label="Arquivos do lote">{datasets.map((dataset, index) => { const ready = Boolean(dataset.mapping.eventType && dataset.fixationLabel.trim() && dataset.saccadeLabel.trim()); return <button role="tab" aria-selected={dataset.id === activeDataset?.id} className={dataset.id === activeDataset?.id ? "active" : ""} key={dataset.id} onClick={() => setActiveDatasetId(dataset.id)}><span>{index + 1}</span><div><strong>{dataset.fileName}</strong><small>{ready ? "pronto" : "revisar eventos"}</small></div>{ready && <CircleCheck />}</button>; })}</div>
            {activeDataset && activeDataset.sheets.length > 1 && <div className="sheet-picker"><div><strong>Planilha do arquivo</strong><span>Escolha a aba que contém os dados brutos.</span></div><Select value={activeDataset.sheetName} onValueChange={(value) => { const selected = activeDataset.sheets.find((sheet) => sheet.name === value); if (selected) { const suggested = suggestMapping(selected.headers); const detected = detectDurationUnit(selected.rows, suggested); const labels = detectEventLabels(selected.rows, suggested); patchDataset(activeDataset.id, { rows: selected.rows, headers: selected.headers, sheetName: selected.name, mapping: suggested, fixationLabel: labels.fixation, saccadeLabel: labels.saccade, customMappings: {}, durationDetection: detected, durationUnit: detected ?? activeDataset.durationUnit, participantOverride: deriveSingleValue(selected.rows, suggested, "participant"), groupOverride: deriveSingleValue(selected.rows, suggested, "group") }); } }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{activeDataset.sheets.map((sheet) => <SelectItem key={sheet.name} value={sheet.name}>{sheet.name} · {sheet.rows.length} linhas</SelectItem>)}</SelectContent></Select></div>}
            <div className="mapping-progress"><div><strong>{activeDataset?.fileName}</strong><span>{mappedCount} de {mappingFields.length} campos reconhecidos</span></div><Badge variant={requiredReady ? "outline" : "secondary"}>{requiredReady ? "tipo de evento mapeado" : "falta campo obrigatório"}</Badge></div>
            <div className="mapping-grid">
              {mappingFields.map((field) => (
                <div className={field.required && !mapping[field.key] ? "mapping-card required" : "mapping-card"} key={field.key}>
                  <div><Label>{field.label}{field.required && <em> obrigatório</em>}</Label><p>{field.hint}</p></div>
                  <Select value={mapping[field.key] ?? "__none__"} onValueChange={(value) => changeMapping(field.key, value)}>
                    <SelectTrigger className="mapping-select"><SelectValue placeholder="Não mapear" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">Não mapear</SelectItem>{headers.map((header) => <SelectItem value={header} key={header}>{header}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {activeDataset?.mapping.eventType && <div className="event-values-panel">
              <div className="section-intro"><div><strong>Como os eventos aparecem neste arquivo?</strong><span>Informe os textos gravados dentro da coluna “{activeDataset.mapping.eventType}”. Isso é diferente do nome da coluna.</span></div><Badge variant="outline">por arquivo</Badge></div>
              <div className="event-value-grid">
                <div><Label htmlFor={`fixation-label-${activeDataset.id}`}>Valor que identifica uma fixação</Label><Input id={`fixation-label-${activeDataset.id}`} list={`event-values-${activeDataset.id}`} value={activeDataset.fixationLabel} onChange={(event) => patchDataset(activeDataset.id, { fixationLabel: event.target.value })} placeholder="Digite exatamente como aparece nas células" /></div>
                <div><Label htmlFor={`saccade-label-${activeDataset.id}`}>Valor que identifica uma sacada</Label><Input id={`saccade-label-${activeDataset.id}`} list={`event-values-${activeDataset.id}`} value={activeDataset.saccadeLabel} onChange={(event) => patchDataset(activeDataset.id, { saccadeLabel: event.target.value })} placeholder="Digite exatamente como aparece nas células" /></div>
              </div>
              <datalist id={`event-values-${activeDataset.id}`}>{eventTypeValues.map((value) => <option value={value} key={value} />)}</datalist>
            </div>}
            <div className="custom-mapping-panel">
              <div className="section-intro"><div><strong>Outras variáveis numéricas</strong><span>Adicione medidas que não aparecem na lista padrão. Dê um nome para a saída e escolha a coluna correspondente em cada arquivo.</span></div><Button type="button" variant="outline" size="sm" onClick={addCustomVariable}><Plus /> Adicionar variável</Button></div>
              {customVariables.length === 0 ? <div className="custom-empty">Nenhuma variável adicional. Use esta opção somente quando precisar tabular outra medida numérica do arquivo.</div> : <div className="custom-variable-list">
                {customVariables.map((variable) => <div className="custom-variable-row" key={variable.id}>
                  <div><Label htmlFor={`custom-name-${variable.id}`}>Nome na planilha final</Label><Input id={`custom-name-${variable.id}`} value={variable.label} onChange={(event) => updateCustomVariable(variable.id, { label: event.target.value })} placeholder="Ex.: Velocidade do evento" /></div>
                  <div><Label>Coluna neste arquivo</Label><Select value={activeDataset?.customMappings[variable.id] ?? "__none__"} onValueChange={(value) => activeDataset && patchDataset(activeDataset.id, { customMappings: { ...activeDataset.customMappings, [variable.id]: value === "__none__" ? "" : value } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Não disponível neste arquivo</SelectItem>{headers.map((header) => <SelectItem value={header} key={header}>{header}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Usar valores das</Label><Select value={variable.eventKind} onValueChange={(value) => updateCustomVariable(variable.id, { eventKind: value as "fixation" | "saccade" | "both" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixation">Fixações</SelectItem><SelectItem value="saccade">Sacadas</SelectItem><SelectItem value="both">Fixações e sacadas — separadas</SelectItem></SelectContent></Select></div>
                  <div><Label>Resumo por estímulo</Label><Select value={variable.aggregation} onValueChange={(value) => updateCustomVariable(variable.id, { aggregation: value as CustomAggregation })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mean">Média e DP</SelectItem><SelectItem value="sum">Soma</SelectItem><SelectItem value="min">Menor valor</SelectItem><SelectItem value="max">Maior valor</SelectItem><SelectItem value="count">Contagem de valores</SelectItem></SelectContent></Select></div>
                  <Button type="button" variant="ghost" size="icon" className="remove-custom" onClick={() => removeCustomVariable(variable.id)} aria-label={`Remover ${variable.label}`}><Trash2 /></Button>
                </div>)}
              </div>}
              {customVariables.length > 0 && <p className="custom-note">Ao trocar de arquivo acima, escolha a coluna equivalente. Se usar fixações e sacadas, o Excel criará resultados separados para não misturar os dois tipos de evento.</p>}
            </div>
            <div className="raw-preview"><div className="preview-title"><div><strong>Prévia do arquivo</strong><span>Planilha: {activeDataset?.sheetName}</span></div><span>5 primeiras linhas</span></div><DataTable rows={rows.slice(0, 5)} limit={5} /></div>
            <div className="actions"><Button variant="outline" onClick={() => setStep(1)}>Voltar ao lote</Button><Button disabled={!allMappingsReady} onClick={() => setStep(3)}>Continuar para regras <ChevronRight /></Button></div>
          </section>
        )}

        {step === 3 && (
          <section className="stage">
            <div className="stage-toolbar"><div><h2>Regras da análise</h2><p>Escolha como os dados serão calculados e organizados no Excel.</p></div><div className="preset-actions"><Button variant="outline" size="sm" onClick={() => presetInput.current?.click()}>Carregar preset</Button><Button variant="outline" size="sm" onClick={downloadPreset}>Salvar preset</Button><input ref={presetInput} type="file" accept=".json,application/json" hidden onChange={(event) => void loadPreset(event.target.files?.[0])} /><Badge variant="outline"><ShieldCheck size={14} /> auditoria ativa</Badge></div></div>
            <div className="config-layout">
              <Card className="config-card">
                <CardHeader><CardTitle>Cálculo dos eventos</CardTitle><CardDescription>Defina a unidade de saída e como a amplitude será lida.</CardDescription></CardHeader>
                <CardContent className="form-grid">
                  <div className="form-span"><Label>Unidade das durações no Excel final</Label><Select value={outputDurationUnit} onValueChange={(value) => setOutputDurationUnit(value as "ms" | "s")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ms">Milissegundos</SelectItem><SelectItem value="s">Segundos</SelectItem></SelectContent></Select><p className="field-help">Cada arquivo será convertido automaticamente para a unidade escolhida aqui. A unidade original já foi definida na etapa de importação.</p></div>
                  <div className="form-span"><Label>Onde a amplitude está gravada</Label><Select value={amplitudeSource} onValueChange={(value) => setAmplitudeSource(value as "auto" | "fixation" | "saccade")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Detectar automaticamente (recomendado)</SelectItem><SelectItem value="fixation">Nas linhas de fixação</SelectItem><SelectItem value="saccade">Nas linhas de sacada</SelectItem></SelectContent></Select><p className="field-help">Algumas exportações Tobii registram a amplitude junto à fixação; outras, junto à sacada.</p></div>
                  <div className="form-span setting-row"><div><strong>Ignorar eventos sem estímulo</strong><span>Evita incluir calibração, intervalos e trechos fora dos slides.</span></div><Switch checked={excludeMissingStimulus} onCheckedChange={setExcludeMissingStimulus} /></div>
                </CardContent>
              </Card>

              <Card className="config-card">
                <CardHeader><CardTitle>Estrutura do estudo</CardTitle><CardDescription>Defina os momentos esperados e como calcular o resumo por participante.</CardDescription></CardHeader>
                <CardContent className="form-stack">
                  <div><Label>Desenho do estudo</Label><Select value={studyDesign} onValueChange={(value) => setStudyDesign(value as "cross-sectional" | "longitudinal")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="longitudinal">Longitudinal / medidas repetidas</SelectItem><SelectItem value="cross-sectional">Transversal / momento único</SelectItem></SelectContent></Select></div>
                  {studyDesign === "longitudinal" && <div><Label htmlFor="moments">Momentos esperados, na ordem</Label><Textarea id="moments" value={momentsText} onChange={(event) => setMomentsText(event.target.value)} placeholder="Momento 1, Momento 2, Momento 3" rows={2} /><p className="field-help">Se um participante não tiver dados em algum momento, a linha será mantida vazia para preservar a estrutura longitudinal.</p></div>}
                  <div><Label>Como calcular as médias finais?</Label><Select value={finalWeighting} onValueChange={(value) => setFinalWeighting(value as "stimulus" | "event")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stimulus">Dar o mesmo peso a cada estímulo</SelectItem><SelectItem value="event">Juntar todos os eventos válidos</SelectItem></SelectContent></Select><p className="field-help">{finalWeighting === "stimulus" ? "Primeiro calcula cada estímulo e depois a média deles. Um estímulo com poucos eventos pesa o mesmo que outro com muitos." : "Calcula a média usando todos os eventos juntos. Estímulos com mais eventos têm maior influência no resultado."}</p></div>
                  {finalWeighting === "stimulus" && <div><Label>Como reunir as contagens dos estímulos?</Label><Select value={countAggregation} onValueChange={(value) => setCountAggregation(value as "mean" | "sum")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mean">Média de eventos por estímulo</SelectItem><SelectItem value="sum">Total de eventos do participante</SelectItem></SelectContent></Select><p className="field-help">Isso afeta somente as contagens finais. O resumo por estímulo continua mostrando o total de cada estímulo.</p></div>}
                  <div className="setting-row"><div><strong>Ordem dos participantes e grupos</strong><span>A fase 3 seguirá a ordem dos arquivos definida na importação e usará os grupos informados lá.</span></div></div>
                </CardContent>
              </Card>
            </div>

            <Card className="formats-card">
              <CardHeader><CardTitle>As três fases do Excel</CardTitle><CardDescription>Escolha quais entregas serão incluídas. Cada uma terá uma guia própria e um layout adequado ao seu uso.</CardDescription></CardHeader>
              <CardContent className="format-grid">
                {([
                  { key: "eventTrace", title: "Fase 1 · Rastreio", detail: "Fixações e sacadas válidas em ordem; pares compartilham a mesma linha.", headers: ["Estímulo", "N fix.", "Dur. fix.", "Dur. sac."], cells: ["Slide 01", "7", "300", "20"] },
                  { key: "stimulusSummary", title: "Fase 2 · Resumo", detail: "Uma linha por estímulo, seguida de MÉDIA/TOTAL e DP.", headers: ["Estímulo", "N fix.", "Média fix.", "Ampl."], cells: ["MÉDIA", "30,5", "361,03", "2,99"] },
                ] as const).map((format) => (
                  <div role="checkbox" aria-checked={outputSheets[format.key]} tabIndex={0} key={format.key} className={outputSheets[format.key] ? "format-card selected" : "format-card"} onClick={() => setOutputSheets((current) => ({ ...current, [format.key]: !current[format.key] }))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOutputSheets((current) => ({ ...current, [format.key]: !current[format.key] })); } }}>
                    <span className="format-top"><span><strong>{format.title}</strong><small>{format.detail}</small></span><Switch checked={outputSheets[format.key]} onClick={(event) => event.stopPropagation()} onCheckedChange={(checked) => setOutputSheets((current) => ({ ...current, [format.key]: checked }))} aria-label={`Incluir ${format.title}`} /></span>
                    <span className="mini-table"><span>{format.headers.map((header) => <b key={header}>{header}</b>)}</span><span>{format.cells.map((cell, index) => <i key={`${cell}-${index}`}>{cell}</i>)}</span></span>
                  </div>
                ))}
                <div role="checkbox" aria-checked={phase3Selected} tabIndex={0} className={phase3Selected ? "format-card selected phase3-card" : "format-card phase3-card"} onClick={() => togglePhase3(!phase3Selected)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); togglePhase3(!phase3Selected); } }}>
                  <span className="format-top"><span><strong>Fase 3 · SPSS/JASP</strong><small>Base retangular com uma linha por caso e nomes de variáveis compatíveis.</small></span><Switch checked={phase3Selected} onClick={(event) => event.stopPropagation()} onCheckedChange={togglePhase3} aria-label="Incluir fase 3 para SPSS e JASP" /></span>
                  <span className="mini-table"><span>{["participante", "momento", "medida_1", "medida_2"].map((header) => <b key={header}>{header}</b>)}</span><span>{["P01", "Momento 1", "24,5", "3,2"].map((cell, index) => <i key={`${cell}-${index}`}>{cell}</i>)}</span></span>
                </div>
              </CardContent>
              {phase3Selected && <div className="phase3-options"><div><strong>Organização para análise estatística</strong><span>A guia ampla é útil para medidas repetidas; a longa funciona melhor em modelos por caso e momento.</span></div><Select value={outputLayout} onValueChange={(value) => changeOutputLayout(value as "long" | "wide" | "both")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="both">Incluir longa e ampla</SelectItem><SelectItem value="long">Somente formato longo</SelectItem><SelectItem value="wide">Somente formato amplo</SelectItem></SelectContent></Select></div>}
            </Card>

            <Card className="metrics-card">
              <CardHeader className="metrics-head"><div><CardTitle>O que deve entrar na tabulação?</CardTitle><CardDescription>Somente as variáveis ativadas aparecerão nas planilhas e na base estatística.</CardDescription></div><div><Button type="button" variant="outline" size="sm" onClick={() => setMetrics(defaultMetrics)}>Básicas</Button><Button type="button" variant="outline" size="sm" onClick={() => setMetrics(Object.fromEntries(metricFields.map(({ key }) => [key, true])) as Record<MetricKey, boolean>)}>Todas</Button><Button type="button" variant="ghost" size="sm" onClick={() => setMetrics(Object.fromEntries(metricFields.map(({ key }) => [key, false])) as Record<MetricKey, boolean>)}>Limpar</Button></div></CardHeader>
              <CardContent className="metrics-grid">
                {metricFields.map((metric) => <div className="metric-row" key={metric.key}><div><strong>{metric.label}</strong><span>{metric.detail}</span></div><Switch checked={metrics[metric.key]} onCheckedChange={(checked) => setMetrics((current) => ({ ...current, [metric.key]: checked }))} aria-label={`Ativar ${metric.label}`} /></div>)}
              </CardContent>
            </Card>
            <div className="selection-summary"><span><strong>{selectedMetricCount}</strong> {selectedMetricCount === 1 ? "variável selecionada" : "variáveis selecionadas"}</span><span><strong>{Number(outputSheets.eventTrace) + Number(outputSheets.stimulusSummary) + Number(phase3Selected)}</strong> {Number(outputSheets.eventTrace) + Number(outputSheets.stimulusSummary) + Number(phase3Selected) === 1 ? "fase no Excel" : "fases no Excel"}</span></div>
            <div className="actions"><Button variant="outline" onClick={() => setStep(2)}>Voltar</Button><Button onClick={run}>Gerar tabulação <Activity /></Button></div>
          </section>
        )}

        {step === 4 && result && (
          <section className="stage results-stage">
            <div className="stage-toolbar"><div><h2>Sua tabulação está pronta</h2><p>Confira cada fase e baixe um único Excel organizado para revisão e análise.</p></div><Button onClick={() => exportWorkbook(result, config, fileName)}><Download /> Baixar Excel organizado</Button></div>
            <div className="summary-grid">
              <div><span>Arquivos</span><strong>{result.summary.sourceFiles.toLocaleString("pt-BR")}</strong><small>lote consolidado</small></div>
              <div><span>Linhas brutas</span><strong>{result.summary.rawRows.toLocaleString("pt-BR")}</strong><small>somadas no lote</small></div>
              <div><span>Fixações únicas</span><strong>{result.summary.fixationEvents.toLocaleString("pt-BR")}</strong><small>após consolidação</small></div>
              <div><span>Pares válidos</span><strong>{result.summary.pairedEvents.toLocaleString("pt-BR")}</strong><small>fixação → sacada</small></div>
              <div><span>{studyDesign === "longitudinal" ? "Matriz longitudinal" : "Casos agregados"}</span><strong>{result.level2.length.toLocaleString("pt-BR")}</strong><small>{studyDesign === "longitudinal" ? "linhas preservadas" : "combinações observadas"}</small></div>
            </div>

            <Tabs defaultValue={outputSheets.eventTrace ? "level1" : outputSheets.stimulusSummary ? "stimulus" : "level2"} className="result-tabs">
              <TabsList variant="line" className="tabs-list"><TabsTrigger value="level1">Fase 1 · rastreio</TabsTrigger><TabsTrigger value="stimulus">Fase 2 · resumo</TabsTrigger><TabsTrigger value="level2">Fase 3 · dados longos</TabsTrigger><TabsTrigger value="wide">Fase 3 · dados amplos</TabsTrigger><TabsTrigger value="chart">Visão geral</TabsTrigger><TabsTrigger value="audit">Auditoria</TabsTrigger></TabsList>
              <TabsContent value="level1"><div className="tab-heading"><div><strong>Rastreio organizado por estímulo</strong><span>Fixações e sacadas válidas seguem a ordem original. Pares compartilham uma linha.</span></div><Badge variant="outline">{result.summary.fixationEvents} fixações · {result.summary.saccadeEvents} sacadas</Badge></div><DataTable rows={level1Preview} headerLabel={friendlyHeader} /></TabsContent>
              <TabsContent value="stimulus"><div className="tab-heading"><div><strong>Resumo por estímulo ou slide</strong><span>Cada linha resume um estímulo. As linhas amarelas mostram a média ou total e o desvio-padrão.</span></div><Badge variant="outline">{result.byStimulus.length} linhas</Badge></div><DataTable rows={result.byStimulus} headerLabel={friendlyHeader} /></TabsContent>
              <TabsContent value="level2"><div className="tab-heading"><div><strong>Formato longo para SPSS/JASP</strong><span>Cada linha representa um participante em um momento.</span></div><Badge variant="outline">{result.level2.length} linhas</Badge></div><DataTable rows={result.level2} headerLabel={friendlyHeader} /></TabsContent>
              <TabsContent value="wide"><div className="tab-heading"><div><strong>Formato amplo para medidas repetidas</strong><span>Cada participante ocupa uma linha; os momentos ficam nas colunas.</span></div><Badge variant="outline">{result.level2Wide.length} linhas</Badge></div><DataTable rows={result.level2Wide} headerLabel={friendlyHeader} /></TabsContent>
              <TabsContent value="chart">
                <div className="chart-panel">
                  <div className="tab-heading"><div><strong>{activeChartMetric?.label ?? "Visão geral"} por grupo</strong><span>Média dos participantes em cada grupo. Escolha abaixo o que deseja comparar.</span></div><Badge variant="outline">{activeChartMetric?.unit(outputDurationUnit) ?? ""}</Badge></div>
                  <div className="chart-metric-picker" role="tablist" aria-label="Métrica exibida no gráfico">
                    {availableChartMetrics.map((option) => <button key={option.key} type="button" role="tab" aria-selected={activeChartMetric?.key === option.key} className={activeChartMetric?.key === option.key ? "active" : ""} onClick={() => setChartMetric(option.key)}>{option.shortLabel}</button>)}
                  </div>
                  {chart.hasValues ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%">
                    {showLineChart ? <LineChart data={chart.data} margin={{ top: 15, right: 24, bottom: 10, left: 2 }}><CartesianGrid strokeDasharray="3 3" stroke="#dbe4ec" /><XAxis dataKey="Momento" tick={{ fill: "#526477", fontSize: 12 }} /><YAxis tick={{ fill: "#526477", fontSize: 12 }} /><Tooltip formatter={(value) => [typeof value === "number" ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : value, activeChartMetric?.label ?? "Valor"]} contentStyle={{ borderRadius: 12, border: "1px solid #dbe4ec" }} /><Legend />{chart.groups.map((group, index) => <Line key={group} type="monotone" dataKey={group} stroke={colors[index % colors.length]} strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />)}</LineChart>
                    : <BarChart data={chart.data} margin={{ top: 15, right: 24, bottom: 10, left: 2 }}><CartesianGrid strokeDasharray="3 3" stroke="#dbe4ec" /><XAxis dataKey="Momento" tick={{ fill: "#526477", fontSize: 12 }} /><YAxis tick={{ fill: "#526477", fontSize: 12 }} /><Tooltip formatter={(value) => [typeof value === "number" ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : value, activeChartMetric?.label ?? "Valor"]} contentStyle={{ borderRadius: 12, border: "1px solid #dbe4ec" }} /><Legend />{chart.groups.map((group, index) => <Bar key={group} dataKey={group} fill={colors[index % colors.length]} radius={[5, 5, 0, 0]} maxBarSize={70} />)}</BarChart>}
                  </ResponsiveContainer></div> : <div className="empty-state">Não há valores numéricos para esta medida. Confira o mapeamento e as métricas selecionadas.</div>}
                </div>
              </TabsContent>
              <TabsContent value="audit"><div className="audit-list">{result.audit.map((item) => <div className={`audit-item ${item.status}`} key={item.test}>{item.status === "ok" ? <CircleCheck /> : <CircleAlert />}<div><strong>{item.test}</strong><p>{item.detail}</p></div><Badge variant="outline">{item.status === "ok" ? "Aprovado" : item.status === "warning" ? "Atenção" : "Falhou"}</Badge></div>)}</div></TabsContent>
            </Tabs>
            <div className="post-export-note"><FileCheck2 /><div><strong>O Excel também inclui guias de conferência e ajuda.</strong><span>Auditoria mostra as verificações; Leia-me explica cada fase; Dicionário define as variáveis da fase 3.</span></div></div>
            <div className="actions"><Button variant="outline" onClick={() => setStep(3)}><RefreshCcw /> Ajustar escolhas</Button><Button onClick={() => exportWorkbook(result, config, fileName)}><Download /> Baixar Excel organizado</Button></div>
          </section>
        )}
      </main>
    </div>
  );
}
