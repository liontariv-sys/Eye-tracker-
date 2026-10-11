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
  Home,
  Eye,
  Cpu,
  Layers3,
  LogOut,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sigma,
  Sparkles,
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
  { key: "participant", label: "Participante", hint: "Coluna com o código ou nome de cada participante" },
  { key: "group", label: "Grupo", hint: "Coluna com a condição ou o grupo de pesquisa" },
  { key: "moment", label: "Momento", hint: "Coluna com a etapa da coleta, como pré ou pós-teste" },
  { key: "stimulus", label: "Estímulo", hint: "Coluna que identifica cada imagem, slide, cena ou tarefa" },
  { key: "trial", label: "Tentativa", hint: "Coluna que diferencia blocos, ensaios ou repetições" },
  { key: "aoi", label: "Área de interesse", hint: "Coluna com o nome da AOI, se o estudo utilizar áreas de interesse" },
  { key: "eventType", label: "Tipo de evento", hint: "Coluna cujas células informam se a linha é fixação ou sacada", required: true },
  { key: "fixationId", label: "ID da fixação", hint: "Coluna que repete o mesmo identificador nas amostras da fixação" },
  { key: "saccadeId", label: "ID da sacada", hint: "Coluna que repete o mesmo identificador nas amostras da sacada" },
  { key: "duration", label: "Duração do evento", hint: "Coluna com a duração de cada fixação ou sacada" },
  { key: "amplitude", label: "Amplitude sacádica", hint: "Coluna com a amplitude de cada sacada" },
  { key: "pupilLeft", label: "Pupila esquerda", hint: "Coluna com a medida pupilar do olho esquerdo" },
  { key: "pupilRight", label: "Pupila direita", hint: "Coluna com a medida pupilar do olho direito" },
  { key: "timestamp", label: "Tempo ou timestamp", hint: "Opcional; se não for mapeado, será usada a ordem original das linhas" },
];

const metricFields: Array<{ key: MetricKey; label: string; detail: string }> = [
  { key: "fixationCount", label: "Número de fixações", detail: "Conta cada ID de fixação uma única vez" },
  { key: "saccadeCount", label: "Número de sacadas", detail: "Conta todas as sacadas válidas de cada estímulo" },
  { key: "fixationDuration", label: "Duração das fixações", detail: "Inclui duração média e desvio-padrão" },
  { key: "saccadeDuration", label: "Duração das sacadas", detail: "Inclui todas as sacadas válidas, mesmo sem fixação pareada" },
  { key: "saccadicAmplitude", label: "Amplitude sacádica", detail: "Inclui amplitude média e desvio-padrão" },
  { key: "pupilLeft", label: "Pupila esquerda", detail: "Valores iguais ou menores que zero serão tratados como ausentes" },
  { key: "pupilRight", label: "Pupila direita", detail: "Valores iguais ou menores que zero serão tratados como ausentes" },
  { key: "pupilBinocular", label: "Pupila binocular", detail: "Calcula a média entre os olhos que possuem valor válido" },
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

const navigationItems = [
  { id: 0, label: "Início", icon: Home },
  ...steps,
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
  const [step, setStep] = useState(0);
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
  const currentNavigationItem = navigationItems.find((item) => item.id === step) ?? navigationItems[0];

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
        <nav aria-label="Navegação do Oculab">
          {navigationItems.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => id <= (datasets.length ? 4 : 1) && setStep(id)} className={step === id ? "step active" : "step"} disabled={id > 1 && !datasets.length}>
              <span className="step-icon">{id > 0 && id < step ? <Check size={17} /> : <Icon size={17} />}</span>
              <span className="step-copy"><small>{id === 0 ? "Conheça" : `Etapa ${String(id).padStart(2, "0")}`}</small><strong>{label}</strong></span>
              {step === id && <ChevronRight size={16} className="step-arrow" />}
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-heading">
            <span className="topbar-step" aria-hidden="true">{step === 0 ? <Home /> : String(step).padStart(2, "0")}</span>
            <div>
              <p className="eyebrow">Laboratório de Percepção, Neurociências e Comportamento · UFPB</p>
              <h1>{currentNavigationItem.label}</h1>
            </div>
          </div>
          <nav className="topbar-actions" aria-label="Ações da conta">
            {isAdmin && <a className="admin-shortcut" href="/admin" aria-label="Gerenciar acessos" title="Gerenciar acessos"><ShieldCheck aria-hidden="true" /><span>Acessos</span></a>}
            {datasets.length > 0 && <div className="file-pill"><FileSpreadsheet size={17} /><div><strong>{datasets.length} {datasets.length === 1 ? "arquivo no lote" : "arquivos no lote"}</strong><span>{totalRows.toLocaleString("pt-BR")} linhas brutas · ordem editável</span></div></div>}
            <a className="signout-shortcut" href="/logout" target="_top" aria-label="Sair do Oculab" title="Sair do Oculab"><LogOut aria-hidden="true" /><span>Sair</span></a>
          </nav>
        </header>

        {error && <div className="error-banner" role="alert"><CircleAlert size={19} /><span>{error}</span><button onClick={() => setError("")}>Fechar</button></div>}

        {step === 0 && (
          <section className="stage home-stage">
            <div className="home-hero">
              <div className="home-hero-copy">
                <span className="home-kicker">LPNeC · UFPB</span>
                <h2>Dados de eye tracking organizados para pesquisa.</h2>
                <p>O LPNeC Oculab apoia pesquisadores na preparação de dados oculomotores, desde a importação dos arquivos brutos até a exportação de planilhas prontas para revisão e análise estatística.</p>
                <div className="home-actions">
                  <Button size="lg" onClick={() => setStep(1)}>Começar tabulação <ChevronRight /></Button>
                  <button type="button" className="home-text-link" onClick={() => document.getElementById("como-usar")?.scrollIntoView({ behavior: "smooth" })}>Ver como funciona</button>
                </div>
              </div>
              <div className="home-hero-mark" aria-hidden="true">
                <Eye />
                <span>Dados brutos</span>
                <ChevronRight />
                <strong>Excel organizado</strong>
              </div>
            </div>

            <div className="home-purpose-grid" aria-label="Principais recursos">
              <article><span><Layers3 /></span><div><strong>Estrutura flexível</strong><p>Mapeia diferentes nomes de colunas e formatos de planilha.</p></div></article>
              <article><span><Sigma /></span><div><strong>Tabulação orientada</strong><p>Calcula somente as variáveis selecionadas pelo pesquisador.</p></div></article>
              <article><span><BarChart3 /></span><div><strong>Saída para análise</strong><p>Gera tabelas para conferência, SPSS, JASP e Excel.</p></div></article>
            </div>

            <div className="home-information-grid">
              <article className="home-info-card">
                <span className="home-section-label">Sobre o projeto</span>
                <h3>Uma ferramenta criada a partir das rotinas de pesquisa do LPNeC.</h3>
                <p>O Oculab surgiu da necessidade de reduzir etapas manuais na organização de dados de rastreamento ocular e tornar o processo mais claro, reproduzível e adaptável a diferentes estudos.</p>
                <p>Seu foco é apoiar a limpeza, a tabulação, a auditoria e a preparação de bases para análises posteriores.</p>
              </article>
              <article className="home-info-card privacy-card">
                <span className="home-info-icon"><Cpu /></span>
                <div><span className="home-section-label">Funcionamento dos dados</span><h3>Processamento realizado no navegador</h3><p>As planilhas brutas são processadas no dispositivo em uso e não são enviadas ao servidor do Oculab. Ao fechar ou atualizar a página, o lote precisa ser importado novamente.</p></div>
              </article>
            </div>

            <section className="home-flow" id="como-usar">
              <div className="home-section-heading"><span className="home-section-label">Como utilizar</span><h3>Da planilha bruta ao arquivo final em quatro etapas</h3><p>A navegação acompanha o fluxo real da ferramenta.</p></div>
              <div className="home-flow-grid">
                {steps.map(({ id, label, icon: Icon }, index) => (
                  <button type="button" key={id} onClick={() => id <= (datasets.length ? 4 : 1) && setStep(id)} disabled={id > 1 && !datasets.length}>
                    <span className="home-flow-number">{String(id).padStart(2, "0")}</span>
                    <span className="home-flow-icon"><Icon /></span>
                    <strong>{label}</strong>
                    <p>{[
                      "Selecione uma ou mais planilhas e identifique participantes e grupos.",
                      "Relacione os campos do arquivo às informações usadas pelo Oculab.",
                      "Escolha variáveis, unidades, desenho do estudo e formato de saída.",
                      "Confira tabelas, gráficos e auditoria antes de baixar o Excel.",
                    ][index]}</p>
                    {index < steps.length - 1 && <ChevronRight className="home-flow-arrow" />}
                  </button>
                ))}
              </div>
              {!datasets.length && <p className="home-flow-note">As etapas seguintes serão liberadas depois que pelo menos um arquivo for importado.</p>}
            </section>

            <footer className="home-credits">
              <div><span className="home-section-label">Desenvolvimento</span><strong>Vinícius Freitas Barbosa da Silva</strong><p>Projeto desenvolvido no contexto das atividades de pesquisa do Laboratório de Percepção, Neurociências e Comportamento — LPNeC/UFPB.</p></div>
              <Button variant="outline" onClick={() => setStep(1)}>Importar dados <UploadCloud /></Button>
            </footer>
          </section>
        )}

        {step === 1 && (
          <section className="stage import-stage">
            <div className="import-intro"><div><h2>Adicione as planilhas que deseja tabular</h2><p>Importe um ou vários arquivos. Para cada um, confirme o participante, o grupo e a unidade usada nas durações.</p></div><Badge variant="outline">Excel · CSV · TSV · ODS</Badge></div>
            <button className="dropzone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void onFiles(event.dataTransfer.files); }}>
              <span className="upload-orbit"><UploadCloud size={30} /></span>
              <strong>Selecione uma ou várias planilhas brutas</strong>
              <span>Os arquivos serão processados juntos e organizados na ordem escolhida por você</span>
              <input ref={fileInput} type="file" multiple accept=".csv,.tsv,.xls,.xlsx,.xlsm,.xlsb,.ods" hidden onChange={(event) => void onFiles(event.target.files ?? undefined)} />
            </button>
            {datasets.length > 0 && <div className="batch-panel">
              <div className="batch-heading"><div><Badge>{datasets.length}</Badge><div><strong>{datasets.length === 1 ? "arquivo anexado" : "arquivos anexados"}</strong><span>Revise os dados de identificação. Arraste a alça numerada ou use as setas para mudar a ordem no Excel.</span></div></div><Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}><UploadCloud /> Adicionar arquivos</Button></div>
              <div className="file-queue">
                {datasets.map((dataset, index) => (
                  <div className="file-queue-item" data-dataset-id={dataset.id} key={dataset.id} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (pointerDragId.current) moveDataset(pointerDragId.current, dataset.id); pointerDragId.current = null; }}>
                    <button className="file-drag-handle" aria-label={`Arrastar ${dataset.fileName}`} title="Pressione e arraste para reordenar" draggable onDragStart={() => { pointerDragId.current = dataset.id; }} onDragEnd={() => { pointerDragId.current = null; }} onPointerDown={(event) => { pointerDragId.current = dataset.id; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={handlePointerMove} onPointerUp={() => { pointerDragId.current = null; }} onPointerCancel={() => { pointerDragId.current = null; }}><GripVertical /><span>{index + 1}</span></button>
                    <div className="file-queue-main">
                      <div className="file-queue-title"><FileSpreadsheet /><div><strong>{dataset.fileName}</strong><span>{dataset.rows.length.toLocaleString("pt-BR")} linhas · {dataset.sheetName}</span></div><Badge variant={dataset.mapping.eventType ? "outline" : "secondary"}>{dataset.mapping.eventType ? "colunas reconhecidas" : "revisar colunas"}</Badge></div>
                      <div className="file-metadata-grid">
                        <div><Label htmlFor={`participant-${dataset.id}`}>Participante</Label><Input id={`participant-${dataset.id}`} value={dataset.participantOverride} onChange={(event) => patchDataset(dataset.id, { participantOverride: event.target.value })} placeholder={dataset.mapping.participant ? `Vazio = usar a coluna ${dataset.mapping.participant}` : `Vazio = usar ${fileStem(dataset.fileName)}`} /><small>Este identificador aparecerá em todas as fases do Excel.</small></div>
                        <div><Label htmlFor={`group-${dataset.id}`}>Grupo</Label><Input id={`group-${dataset.id}`} list="oculab-groups" value={dataset.groupOverride} onChange={(event) => patchDataset(dataset.id, { groupOverride: event.target.value })} placeholder={dataset.mapping.group ? `Vazio = usar a coluna ${dataset.mapping.group}` : "Ex.: Grupo controle"} /><small>O grupo acompanhará o participante na base para SPSS/JASP.</small></div>
                        <div><Label>Como a duração está gravada?</Label><Select value={dataset.durationUnit} onValueChange={(value) => patchDataset(dataset.id, { durationUnit: value as "ms" | "s" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ms">Milissegundos (ex.: 250)</SelectItem><SelectItem value="s">Segundos (ex.: 0,25)</SelectItem></SelectContent></Select><small>{dataset.durationDetection ? `O Oculab sugeriu ${dataset.durationDetection === "ms" ? "milissegundos" : "segundos"}; confirme antes de continuar.` : "Escolha a unidade usada nos valores deste arquivo."}</small></div>
                      </div>
                    </div>
                    <div className="file-queue-actions"><Button variant="ghost" size="icon" onClick={() => nudgeDataset(dataset.id, -1)} disabled={index === 0} aria-label="Mover para cima"><ArrowUp /></Button><Button variant="ghost" size="icon" onClick={() => nudgeDataset(dataset.id, 1)} disabled={index === datasets.length - 1} aria-label="Mover para baixo"><ArrowDown /></Button><Button variant="ghost" size="icon" className="remove-file" onClick={() => removeDataset(dataset.id)} aria-label="Remover arquivo"><Trash2 /></Button></div>
                  </div>
                ))}
              </div>
              <datalist id="oculab-groups">{Array.from(new Set(["Grupo controle", "Grupo experimental", ...batchGroups])).map((group) => <option value={group} key={group} />)}</datalist>
              <div className="batch-footer"><span><strong>No Excel final:</strong> as fases 1 e 2 seguirão esta ordem; a fase 3 reunirá os participantes em uma única tabela.</span><Button onClick={() => { setActiveDatasetId(datasets[0].id); setStep(2); }}>Mapear colunas <ChevronRight /></Button></div>
            </div>}
            <div className="demo-row"><div><Sparkles size={17} /><span><strong>Primeira vez aqui?</strong> Teste um lote com dois participantes sem precisar de arquivo próprio.</span></div><Button variant="outline" onClick={useDemo}>Usar lote de exemplo</Button></div>
          </section>
        )}

        {step === 2 && (
          <section className="stage">
            <div className="stage-toolbar"><div><h2>Mapeamento por arquivo</h2><p>Em cada campo, selecione a coluna do arquivo bruto que contém aquela informação. Se a informação não existir, mantenha “Não mapear”.</p></div><Badge variant={allMappingsReady ? "default" : "secondary"}>{datasets.filter((dataset) => dataset.mapping.eventType && dataset.fixationLabel.trim() && dataset.saccadeLabel.trim()).length} de {datasets.length} arquivos prontos</Badge></div>
            <div className="dataset-tabs" role="tablist" aria-label="Arquivos do lote">{datasets.map((dataset, index) => { const ready = Boolean(dataset.mapping.eventType && dataset.fixationLabel.trim() && dataset.saccadeLabel.trim()); return <button role="tab" aria-selected={dataset.id === activeDataset?.id} className={dataset.id === activeDataset?.id ? "active" : ""} key={dataset.id} onClick={() => setActiveDatasetId(dataset.id)}><span>{index + 1}</span><div><strong>{dataset.fileName}</strong><small>{ready ? "pronto" : "revisar eventos"}</small></div>{ready && <CircleCheck />}</button>; })}</div>
            {activeDataset && activeDataset.sheets.length > 1 && <div className="sheet-picker"><div><strong>Planilha do arquivo</strong><span>Escolha a aba que contém os dados brutos.</span></div><Select value={activeDataset.sheetName} onValueChange={(value) => { const selected = activeDataset.sheets.find((sheet) => sheet.name === value); if (selected) { const suggested = suggestMapping(selected.headers); const detected = detectDurationUnit(selected.rows, suggested); const labels = detectEventLabels(selected.rows, suggested); patchDataset(activeDataset.id, { rows: selected.rows, headers: selected.headers, sheetName: selected.name, mapping: suggested, fixationLabel: labels.fixation, saccadeLabel: labels.saccade, customMappings: {}, durationDetection: detected, durationUnit: detected ?? activeDataset.durationUnit, participantOverride: deriveSingleValue(selected.rows, suggested, "participant"), groupOverride: deriveSingleValue(selected.rows, suggested, "group") }); } }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{activeDataset.sheets.map((sheet) => <SelectItem key={sheet.name} value={sheet.name}>{sheet.name} · {sheet.rows.length} linhas</SelectItem>)}</SelectContent></Select></div>}
            <div className="mapping-progress"><div><strong>{activeDataset?.fileName}</strong><span>{mappedCount} de {mappingFields.length} campos relacionados às colunas do arquivo</span></div><Badge variant={requiredReady ? "outline" : "secondary"}>{requiredReady ? "eventos identificados" : "selecione o tipo de evento"}</Badge></div>
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
              <div className="section-intro"><div><strong>Quais textos identificam fixações e sacadas?</strong><span>Use exatamente os valores encontrados nas células da coluna “{activeDataset.mapping.eventType}”. Exemplo: “Fixation” e “Saccade”.</span></div><Badge variant="outline">confirmar em cada arquivo</Badge></div>
              <div className="event-value-grid">
                <div><Label htmlFor={`fixation-label-${activeDataset.id}`}>Valor que identifica uma fixação</Label><Input id={`fixation-label-${activeDataset.id}`} list={`event-values-${activeDataset.id}`} value={activeDataset.fixationLabel} onChange={(event) => patchDataset(activeDataset.id, { fixationLabel: event.target.value })} placeholder="Digite exatamente como aparece nas células" /></div>
                <div><Label htmlFor={`saccade-label-${activeDataset.id}`}>Valor que identifica uma sacada</Label><Input id={`saccade-label-${activeDataset.id}`} list={`event-values-${activeDataset.id}`} value={activeDataset.saccadeLabel} onChange={(event) => patchDataset(activeDataset.id, { saccadeLabel: event.target.value })} placeholder="Digite exatamente como aparece nas células" /></div>
              </div>
              <datalist id={`event-values-${activeDataset.id}`}>{eventTypeValues.map((value) => <option value={value} key={value} />)}</datalist>
            </div>}
            <div className="custom-mapping-panel">
              <div className="section-intro"><div><strong>Outras variáveis numéricas</strong><span>Use esta área quando quiser tabular uma medida que não aparece na lista padrão. O nome escolhido será usado como título no Excel final.</span></div><Button type="button" variant="outline" size="sm" onClick={addCustomVariable}><Plus /> Adicionar variável</Button></div>
              {customVariables.length === 0 ? <div className="custom-empty">Nenhuma variável adicional. Use esta opção somente quando precisar tabular outra medida numérica do arquivo.</div> : <div className="custom-variable-list">
                {customVariables.map((variable) => <div className="custom-variable-row" key={variable.id}>
                  <div><Label htmlFor={`custom-name-${variable.id}`}>Nome na planilha final</Label><Input id={`custom-name-${variable.id}`} value={variable.label} onChange={(event) => updateCustomVariable(variable.id, { label: event.target.value })} placeholder="Ex.: Velocidade do evento" /></div>
                  <div><Label>Coluna neste arquivo</Label><Select value={activeDataset?.customMappings[variable.id] ?? "__none__"} onValueChange={(value) => activeDataset && patchDataset(activeDataset.id, { customMappings: { ...activeDataset.customMappings, [variable.id]: value === "__none__" ? "" : value } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Não disponível neste arquivo</SelectItem>{headers.map((header) => <SelectItem value={header} key={header}>{header}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Usar valores das</Label><Select value={variable.eventKind} onValueChange={(value) => updateCustomVariable(variable.id, { eventKind: value as "fixation" | "saccade" | "both" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixation">Fixações</SelectItem><SelectItem value="saccade">Sacadas</SelectItem><SelectItem value="both">Fixações e sacadas — separadas</SelectItem></SelectContent></Select></div>
                  <div><Label>Resumo por estímulo</Label><Select value={variable.aggregation} onValueChange={(value) => updateCustomVariable(variable.id, { aggregation: value as CustomAggregation })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mean">Média e DP</SelectItem><SelectItem value="sum">Soma</SelectItem><SelectItem value="min">Menor valor</SelectItem><SelectItem value="max">Maior valor</SelectItem><SelectItem value="count">Contagem de valores</SelectItem></SelectContent></Select></div>
                  <Button type="button" variant="ghost" size="icon" className="remove-custom" onClick={() => removeCustomVariable(variable.id)} aria-label={`Remover ${variable.label}`}><Trash2 /></Button>
                </div>)}
              </div>}
              {customVariables.length > 0 && <p className="custom-note"><strong>Para cada arquivo:</strong> selecione a coluna que contém essa medida. Em “Fixações e sacadas”, o Oculab criará colunas separadas para cada tipo de evento.</p>}
            </div>
            <div className="raw-preview"><div className="preview-title"><div><strong>Prévia do arquivo</strong><span>Planilha: {activeDataset?.sheetName}</span></div><span>5 primeiras linhas</span></div><DataTable rows={rows.slice(0, 5)} limit={5} /></div>
            <div className="actions"><Button variant="outline" onClick={() => setStep(1)}>Voltar ao lote</Button><Button disabled={!allMappingsReady} onClick={() => setStep(3)}>Continuar para regras <ChevronRight /></Button></div>
          </section>
        )}

        {step === 3 && (
          <section className="stage">
            <div className="stage-toolbar"><div><h2>Configure o arquivo final</h2><p>Defina como os valores serão calculados e quais guias aparecerão no Excel.</p></div><div className="preset-actions"><Button variant="outline" size="sm" onClick={() => presetInput.current?.click()}>Carregar configuração</Button><Button variant="outline" size="sm" onClick={downloadPreset}>Salvar configuração</Button><input ref={presetInput} type="file" accept=".json,application/json" hidden onChange={(event) => void loadPreset(event.target.files?.[0])} /><Badge variant="outline"><ShieldCheck size={14} /> verificações automáticas ativas</Badge></div></div>
            <div className="config-layout">
              <Card className="config-card">
                <CardHeader><CardTitle>Cálculo dos eventos</CardTitle><CardDescription>Escolha como as durações e amplitudes aparecerão no resultado.</CardDescription></CardHeader>
                <CardContent className="form-grid">
                  <div className="form-span"><Label>Unidade das durações no Excel final</Label><Select value={outputDurationUnit} onValueChange={(value) => setOutputDurationUnit(value as "ms" | "s")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ms">Milissegundos</SelectItem><SelectItem value="s">Segundos</SelectItem></SelectContent></Select><p className="field-help"><strong>Resultado:</strong> todas as durações serão convertidas para esta unidade, mesmo quando os arquivos originais utilizarem unidades diferentes.</p></div>
                  <div className="form-span"><Label>Em quais linhas está a amplitude sacádica?</Label><Select value={amplitudeSource} onValueChange={(value) => setAmplitudeSource(value as "auto" | "fixation" | "saccade")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Deixar o Oculab identificar</SelectItem><SelectItem value="fixation">Nas linhas classificadas como fixação</SelectItem><SelectItem value="saccade">Nas linhas classificadas como sacada</SelectItem></SelectContent></Select><p className="field-help"><strong>Quando alterar:</strong> escolha manualmente apenas se você souber onde o eye tracker gravou a amplitude. Caso contrário, mantenha a identificação automática.</p></div>
                  <div className="form-span setting-row"><div><strong>Excluir linhas sem estímulo identificado</strong><span>Ativado: linhas sem nome de estímulo não entram nos cálculos. Isso costuma remover calibração, intervalos e trechos fora da tarefa.</span></div><Switch checked={excludeMissingStimulus} onCheckedChange={setExcludeMissingStimulus} /></div>
                </CardContent>
              </Card>

              <Card className="config-card">
                <CardHeader><CardTitle>Estrutura do estudo</CardTitle><CardDescription>Informe se cada participante possui uma única coleta ou vários momentos.</CardDescription></CardHeader>
                <CardContent className="form-stack">
                  <div><Label>Desenho do estudo</Label><Select value={studyDesign} onValueChange={(value) => setStudyDesign(value as "cross-sectional" | "longitudinal")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="longitudinal">Longitudinal / medidas repetidas</SelectItem><SelectItem value="cross-sectional">Transversal / momento único</SelectItem></SelectContent></Select></div>
                  {studyDesign === "longitudinal" && <div><Label htmlFor="moments">Momentos esperados, na ordem</Label><Textarea id="moments" value={momentsText} onChange={(event) => setMomentsText(event.target.value)} placeholder="Momento 1, Momento 2, Momento 3" rows={2} /><p className="field-help"><strong>Resultado:</strong> o Oculab criará uma linha para cada momento informado. Quando não houver dados, a linha ficará vazia em vez de desaparecer.</p></div>}
                  <div><Label>Como formar a média final de cada participante?</Label><Select value={finalWeighting} onValueChange={(value) => setFinalWeighting(value as "stimulus" | "event")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stimulus">Calcular cada estímulo antes da média final</SelectItem><SelectItem value="event">Calcular todos os eventos juntos</SelectItem></SelectContent></Select><p className="field-help"><strong>Diferença:</strong> {finalWeighting === "stimulus" ? "cada estímulo terá a mesma influência na média final, mesmo que possua quantidades diferentes de eventos." : "cada evento terá o mesmo peso; portanto, estímulos com mais eventos terão maior influência na média final."}</p></div>
                  {finalWeighting === "stimulus" && <div><Label>O que mostrar nas contagens finais?</Label><Select value={countAggregation} onValueChange={(value) => setCountAggregation(value as "mean" | "sum")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mean">Média da contagem entre estímulos</SelectItem><SelectItem value="sum">Soma das contagens de todos os estímulos</SelectItem></SelectContent></Select><p className="field-help"><strong>Afeta apenas a fase 3:</strong> a fase 2 continuará mostrando a contagem própria de cada estímulo.</p></div>}
                  <div className="setting-row"><div><strong>Ordem e grupos na fase 3</strong><span>Os participantes seguirão a ordem definida na importação. O grupo informado em cada arquivo será mantido em uma coluna própria.</span></div></div>
                </CardContent>
              </Card>
            </div>

            <Card className="formats-card">
              <CardHeader><CardTitle>Quais fases incluir no Excel?</CardTitle><CardDescription>Ative somente as guias que deseja receber. A seleção não altera os cálculos das demais fases.</CardDescription></CardHeader>
              <CardContent className="format-grid">
                {([
                  { key: "eventTrace", title: "Fase 1 · Eventos", detail: "Mostra as durações evento a evento, organizadas por estímulo e na ordem em que ocorreram.", headers: ["Estímulo", "N fix.", "Dur. fix.", "Dur. sac."], cells: ["Slide 01", "7", "300", "20"] },
                  { key: "stimulusSummary", title: "Fase 2 · Resumo por estímulo", detail: "Reúne contagens, médias e desvios-padrão em uma linha para cada estímulo.", headers: ["Estímulo", "N fix.", "Média fix.", "Ampl."], cells: ["MÉDIA", "30,5", "361,03", "2,99"] },
                ] as const).map((format) => (
                  <div role="checkbox" aria-checked={outputSheets[format.key]} tabIndex={0} key={format.key} className={outputSheets[format.key] ? "format-card selected" : "format-card"} onClick={() => setOutputSheets((current) => ({ ...current, [format.key]: !current[format.key] }))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOutputSheets((current) => ({ ...current, [format.key]: !current[format.key] })); } }}>
                    <span className="format-top"><span><strong>{format.title}</strong><small>{format.detail}</small></span><Switch checked={outputSheets[format.key]} onClick={(event) => event.stopPropagation()} onCheckedChange={(checked) => setOutputSheets((current) => ({ ...current, [format.key]: checked }))} aria-label={`Incluir ${format.title}`} /></span>
                    <span className="mini-table"><span>{format.headers.map((header) => <b key={header}>{header}</b>)}</span><span>{format.cells.map((cell, index) => <i key={`${cell}-${index}`}>{cell}</i>)}</span></span>
                  </div>
                ))}
                <div role="checkbox" aria-checked={phase3Selected} tabIndex={0} className={phase3Selected ? "format-card selected phase3-card" : "format-card phase3-card"} onClick={() => togglePhase3(!phase3Selected)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); togglePhase3(!phase3Selected); } }}>
                  <span className="format-top"><span><strong>Fase 3 · Base para SPSS/JASP</strong><small>Organiza os resultados por participante e momento, com nomes de colunas adequados para análise estatística.</small></span><Switch checked={phase3Selected} onClick={(event) => event.stopPropagation()} onCheckedChange={togglePhase3} aria-label="Incluir fase 3 para SPSS e JASP" /></span>
                  <span className="mini-table"><span>{["participante", "momento", "medida_1", "medida_2"].map((header) => <b key={header}>{header}</b>)}</span><span>{["P01", "Momento 1", "24,5", "3,2"].map((cell, index) => <i key={`${cell}-${index}`}>{cell}</i>)}</span></span>
                </div>
              </CardContent>
              {phase3Selected && <div className="phase3-options"><div><strong>Formato da base estatística</strong><span><b>Longo:</b> uma linha por participante e momento. <b>Amplo:</b> uma linha por participante, com cada momento em colunas diferentes.</span></div><Select value={outputLayout} onValueChange={(value) => changeOutputLayout(value as "long" | "wide" | "both")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="both">Incluir os dois formatos</SelectItem><SelectItem value="long">Incluir somente o formato longo</SelectItem><SelectItem value="wide">Incluir somente o formato amplo</SelectItem></SelectContent></Select></div>}
            </Card>

            <Card className="metrics-card">
              <CardHeader className="metrics-head"><div><CardTitle>Variáveis que serão tabuladas</CardTitle><CardDescription>Somente as variáveis ativadas abaixo serão calculadas e incluídas nas planilhas finais.</CardDescription></div><div><Button type="button" variant="outline" size="sm" onClick={() => setMetrics(defaultMetrics)}>Selecionar básicas</Button><Button type="button" variant="outline" size="sm" onClick={() => setMetrics(Object.fromEntries(metricFields.map(({ key }) => [key, true])) as Record<MetricKey, boolean>)}>Selecionar todas</Button><Button type="button" variant="ghost" size="sm" onClick={() => setMetrics(Object.fromEntries(metricFields.map(({ key }) => [key, false])) as Record<MetricKey, boolean>)}>Desmarcar</Button></div></CardHeader>
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
              <div><span>Arquivos processados</span><strong>{result.summary.sourceFiles.toLocaleString("pt-BR")}</strong><small>reunidos neste resultado</small></div>
              <div><span>Linhas lidas</span><strong>{result.summary.rawRows.toLocaleString("pt-BR")}</strong><small>total dos arquivos brutos</small></div>
              <div><span>Fixações identificadas</span><strong>{result.summary.fixationEvents.toLocaleString("pt-BR")}</strong><small>IDs únicos de fixação</small></div>
              <div><span>Fixações com sacada seguinte</span><strong>{result.summary.pairedEvents.toLocaleString("pt-BR")}</strong><small>pares cronológicos encontrados</small></div>
              <div><span>{studyDesign === "longitudinal" ? "Linhas na base longitudinal" : "Linhas na base final"}</span><strong>{result.level2.length.toLocaleString("pt-BR")}</strong><small>{studyDesign === "longitudinal" ? "inclui momentos sem dados" : "casos resumidos"}</small></div>
            </div>

            <Tabs defaultValue={outputSheets.eventTrace ? "level1" : outputSheets.stimulusSummary ? "stimulus" : "level2"} className="result-tabs">
              <TabsList variant="line" className="tabs-list"><TabsTrigger value="level1">Fase 1 · rastreio</TabsTrigger><TabsTrigger value="stimulus">Fase 2 · resumo</TabsTrigger><TabsTrigger value="level2">Fase 3 · dados longos</TabsTrigger><TabsTrigger value="wide">Fase 3 · dados amplos</TabsTrigger><TabsTrigger value="chart">Visão geral</TabsTrigger><TabsTrigger value="audit">Auditoria</TabsTrigger></TabsList>
              <TabsContent value="level1"><div className="tab-heading"><div><strong>Eventos organizados por estímulo</strong><span>A tabela preserva a ordem dos eventos. Quando houver uma sacada imediatamente após uma fixação, ambas aparecem na mesma linha; as demais sacadas continuam na coluna de duração de sacadas.</span></div><Badge variant="outline">{result.summary.fixationEvents} fixações · {result.summary.saccadeEvents} sacadas</Badge></div><DataTable rows={level1Preview} headerLabel={friendlyHeader} /></TabsContent>
              <TabsContent value="stimulus"><div className="tab-heading"><div><strong>Resumo por estímulo ou slide</strong><span>Cada linha reúne as medidas de um estímulo. No Excel, as linhas destacadas ao final de cada participante mostram média ou total e desvio-padrão.</span></div><Badge variant="outline">{result.byStimulus.length} linhas</Badge></div><DataTable rows={result.byStimulus} headerLabel={friendlyHeader} /></TabsContent>
              <TabsContent value="level2"><div className="tab-heading"><div><strong>Formato longo para SPSS/JASP</strong><span>Cada linha representa a combinação entre um participante e um momento. Este formato é indicado para modelos que analisam observações repetidas em linhas.</span></div><Badge variant="outline">{result.level2.length} linhas</Badge></div><DataTable rows={result.level2} headerLabel={friendlyHeader} /></TabsContent>
              <TabsContent value="wide"><div className="tab-heading"><div><strong>Formato amplo para medidas repetidas</strong><span>Cada participante ocupa uma única linha. As medidas de cada momento aparecem em colunas separadas.</span></div><Badge variant="outline">{result.level2Wide.length} linhas</Badge></div><DataTable rows={result.level2Wide} headerLabel={friendlyHeader} /></TabsContent>
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
            <div className="post-export-note"><FileCheck2 /><div><strong>O Excel inclui informações para conferir e reutilizar a tabulação.</strong><span>A guia “Auditoria” registra as verificações realizadas; “Leia-me” explica a estrutura do arquivo; e “Dicionário” descreve as variáveis da fase 3.</span></div></div>
            <div className="actions"><Button variant="outline" onClick={() => setStep(3)}><RefreshCcw /> Ajustar escolhas</Button><Button onClick={() => exportWorkbook(result, config, fileName)}><Download /> Baixar Excel organizado</Button></div>
          </section>
        )}
      </main>
    </div>
  );
}
