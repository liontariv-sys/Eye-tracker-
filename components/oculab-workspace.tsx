"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  Focus,
  Gauge,
  GripVertical,
  Home,
  Layers3,
  LogOut,
  Plus,
  RefreshCcw,
  ShieldCheck,
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
import { detectDurationUnit, detectEventLabels, exportWorkbook, demoRows, readDataFile, suggestMapping } from "@/lib/eye/io";
import { processEyeData } from "@/lib/eye/engine";
import { batchMapping, deriveSingleValue, fileStem, normalizeBatchRows } from "@/lib/eye/batch";
import { customEventKey, customOutputLabel, customOutputScopes, customRawColumn, customSdKey, customSummaryKey } from "@/lib/eye/custom";
import type { AoiConfig, AoiDefinition, AoiMetricKey, ColumnMap, CustomAggregation, CustomVariableConfig, EngineConfig, FieldKey, HeatmapPoint, MetricKey, ProcessResult, RawRow } from "@/lib/eye/types";

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
  aoiBinaryMappings: Record<string, string>;
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

const defaultAoiMetrics: Record<AoiMetricKey, boolean> = {
  ttff: true,
  dwellTime: true,
  fixationCount: true,
  visitOrder: true,
  reach: true,
};

const defaultAoiConfig: AoiConfig = {
  enabled: false,
  mode: "labels",
  timestampUnit: "ms",
  coordinateSpace: "auto",
  definitions: [],
  metrics: defaultAoiMetrics,
};

const aoiMetricFields: Array<{ key: AoiMetricKey; label: string; detail: string }> = [
  { key: "ttff", label: "Tempo até a primeira fixação (TTFF)", detail: "Usa a coluna de tempo quando ela existe. Sem timestamp, fica em branco e não impede as outras análises." },
  { key: "dwellTime", label: "Tempo total de permanência", detail: "Soma das durações de fixação dentro da AOI." },
  { key: "fixationCount", label: "Número de fixações", detail: "Quantidade de fixações que atingiram a AOI." },
  { key: "visitOrder", label: "Ordem da primeira visita", detail: "Indica qual AOI foi vista primeiro, segundo, terceiro e assim por diante." },
  { key: "reach", label: "Alcance entre participantes", detail: "Percentual de participantes que olharam para cada AOI." },
];

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

const aoiChartMetricOptions: Array<{ key: string; metric: AoiMetricKey; label: string; unit: (durationUnit: string) => string }> = [
  { key: "TTFF_Medio", metric: "ttff", label: "TTFF médio", unit: (durationUnit) => durationUnit },
  { key: "Tempo_Total_Permanencia_Medio", metric: "dwellTime", label: "Permanência média", unit: (durationUnit) => durationUnit },
  { key: "Fixacoes_Medias_AOI", metric: "fixationCount", label: "Média de fixações", unit: () => "fixações" },
  { key: "Ordem_Media_Primeira_Visita", metric: "visitOrder", label: "Ordem média da visita", unit: () => "posição" },
  { key: "Alcance_Percentual", metric: "reach", label: "Participantes que olharam", unit: () => "%" },
];

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

function HeatmapCanvas({ imageSrc = "", imageWidth, imageHeight, points, definitions }: {
  imageSrc?: string;
  imageWidth: number;
  imageHeight: number;
  points: HeatmapPoint[];
  definitions: AoiDefinition[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageWidth || !imageHeight) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let cancelled = false;

    const render = (image?: HTMLImageElement) => {
      if (cancelled) return;
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      context.clearRect(0, 0, imageWidth, imageHeight);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, imageWidth, imageHeight);

      if (image) {
        context.drawImage(image, 0, 0, imageWidth, imageHeight);
      } else {
        context.save();
        context.strokeStyle = "rgba(12, 91, 94, .075)";
        context.lineWidth = 1;
        const spacing = Math.max(40, Math.round(Math.max(imageWidth, imageHeight) / 16));
        for (let x = spacing; x < imageWidth; x += spacing) {
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, imageHeight);
          context.stroke();
        }
        for (let y = spacing; y < imageHeight; y += spacing) {
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(imageWidth, y);
          context.stroke();
        }
        context.restore();
      }

      const validPoints = points.filter((point) =>
        Number.isFinite(point.X) && Number.isFinite(point.Y) && point.X >= 0 && point.Y >= 0);
      const normalizedPoints = validPoints.length > 0 && validPoints.every((point) =>
        point.X <= 1 && point.Y <= 1);
      const maxPointX = Math.max(0, ...validPoints.map((point) => point.X));
      const maxPointY = Math.max(0, ...validPoints.map((point) => point.Y));
      const needsFit = !normalizedPoints && (maxPointX > imageWidth || maxPointY > imageHeight);
      const sourceWidth = needsFit ? Math.max(maxPointX * 1.02, 1) : imageWidth;
      const sourceHeight = needsFit ? Math.max(maxPointY * 1.02, 1) : imageHeight;
      const displayPoints = validPoints.map((point) => ({
        ...point,
        X: normalizedPoints ? point.X * imageWidth : needsFit ? point.X * imageWidth / sourceWidth : point.X,
        Y: normalizedPoints ? point.Y * imageHeight : needsFit ? point.Y * imageHeight / sourceHeight : point.Y,
      }));

      const density = document.createElement("canvas");
      density.width = imageWidth;
      density.height = imageHeight;
      const densityContext = density.getContext("2d");
      if (densityContext && displayPoints.length) {
        const sortedWeights = displayPoints
          .map((point) => Math.max(1, point.Peso))
          .sort((a, b) => a - b);
        const weightReference = sortedWeights[Math.floor((sortedWeights.length - 1) * 0.95)] ?? 1;
        const radius = Math.max(22, Math.min(92, Math.min(imageWidth, imageHeight) * 0.06));
        densityContext.globalCompositeOperation = "lighter";
        for (const point of displayPoints) {
          const relativeWeight = Math.min(1, Math.max(0, point.Peso) / Math.max(1, weightReference));
          const strength = 0.08 + 0.34 * Math.sqrt(relativeWeight);
          const gradient = densityContext.createRadialGradient(point.X, point.Y, 0, point.X, point.Y, radius);
          gradient.addColorStop(0, `rgba(0,0,0,${strength})`);
          gradient.addColorStop(0.36, `rgba(0,0,0,${strength * 0.72})`);
          gradient.addColorStop(0.72, `rgba(0,0,0,${strength * 0.28})`);
          gradient.addColorStop(1, "rgba(0,0,0,0)");
          densityContext.fillStyle = gradient;
          densityContext.fillRect(point.X - radius, point.Y - radius, radius * 2, radius * 2);
        }

        const pixels = densityContext.getImageData(0, 0, imageWidth, imageHeight);
        const histogram = new Uint32Array(256);
        let nonZeroPixels = 0;
        for (let index = 3; index < pixels.data.length; index += 4) {
          const alpha = pixels.data[index];
          if (alpha > 0) {
            histogram[alpha] += 1;
            nonZeroPixels += 1;
          }
        }
        const percentileTarget = Math.max(1, Math.ceil(nonZeroPixels * 0.985));
        let accumulated = 0;
        let referenceAlpha = 255;
        for (let alpha = 1; alpha < histogram.length; alpha += 1) {
          accumulated += histogram[alpha];
          if (accumulated >= percentileTarget) {
            referenceAlpha = alpha;
            break;
          }
        }

        const palette = (value: number) => {
          const stops = [[20, 70, 170], [0, 164, 224], [0, 202, 187], [94, 211, 83], [255, 220, 55], [244, 58, 48]];
          const position = Math.min(0.999, Math.max(0, value)) * (stops.length - 1);
          const index = Math.floor(position);
          const mix = position - index;
          const left = stops[index];
          const right = stops[Math.min(index + 1, stops.length - 1)];
          return left.map((channel, channelIndex) => Math.round(channel + (right[channelIndex] - channel) * mix));
        };

        for (let index = 0; index < pixels.data.length; index += 4) {
          const alpha = pixels.data[index + 3];
          if (alpha === 0) continue;
          const normalizedDensity = Math.min(1, alpha / Math.max(1, referenceAlpha));
          const visibleDensity = Math.pow(normalizedDensity, 0.55);
          const [red, green, blue] = palette(visibleDensity);
          pixels.data[index] = red;
          pixels.data[index + 1] = green;
          pixels.data[index + 2] = blue;
          pixels.data[index + 3] = Math.round((0.3 + visibleDensity * 0.5) * 255);
        }
        densityContext.globalCompositeOperation = "source-over";
        densityContext.putImageData(pixels, 0, 0);
        context.drawImage(density, 0, 0);

        context.save();
        context.fillStyle = "rgba(8, 48, 112, .58)";
        const markerRadius = Math.max(1.6, Math.min(3.2, Math.min(imageWidth, imageHeight) / 360));
        for (const point of displayPoints) {
          context.beginPath();
          context.arc(point.X, point.Y, markerRadius, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }

      const boundedDefinitions = definitions.filter((definition) =>
        [definition.xMin, definition.yMin, definition.xMax, definition.yMax].every((value) => value !== null));
      const normalizedDefinitions = boundedDefinitions.length > 0 && boundedDefinitions.every((definition) =>
        [definition.xMin, definition.yMin, definition.xMax, definition.yMax].every((value) => typeof value === "number" && value >= 0 && value <= 1));

      context.save();
      const fontSize = Math.max(13, Math.min(22, Math.round(imageWidth / 72)));
      context.font = `700 ${fontSize}px sans-serif`;
      context.textBaseline = "middle";
      context.lineWidth = Math.max(2, imageWidth / 520);
      boundedDefinitions.forEach((definition, definitionIndex) => {
        const scaleX = (value: number) => normalizedDefinitions ? value * imageWidth : value;
        const scaleY = (value: number) => normalizedDefinitions ? value * imageHeight : value;
        const x = Math.min(scaleX(definition.xMin!), scaleX(definition.xMax!));
        const y = Math.min(scaleY(definition.yMin!), scaleY(definition.yMax!));
        const width = Math.abs(scaleX(definition.xMax!) - scaleX(definition.xMin!));
        const height = Math.abs(scaleY(definition.yMax!) - scaleY(definition.yMin!));
        context.strokeStyle = image ? "rgba(255,255,255,.98)" : "rgba(7,62,61,.88)";
        context.setLineDash([10, 7]);
        context.strokeRect(x, y, width, height);

        const label = definition.name.trim() || `AOI ${definitionIndex + 1}`;
        const labelHeight = fontSize + 12;
        const labelWidth = Math.min(imageWidth - 8, context.measureText(label).width + 20);
        const labelX = Math.max(4, Math.min(imageWidth - labelWidth - 4, x + 6));
        const labelY = Math.max(4, Math.min(imageHeight - labelHeight - 4, y + 6));
        context.setLineDash([]);
        context.fillStyle = "rgba(255,255,255,.95)";
        context.fillRect(labelX, labelY, labelWidth, labelHeight);
        context.strokeStyle = "rgba(7,82,79,.9)";
        context.lineWidth = Math.max(1, imageWidth / 1000);
        context.strokeRect(labelX, labelY, labelWidth, labelHeight);
        context.fillStyle = "#074b49";
        context.fillText(label, labelX + 10, labelY + labelHeight / 2);
      });
      context.restore();
    };

    if (imageSrc) {
      const image = new Image();
      image.onload = () => render(image);
      image.onerror = () => render();
      image.src = imageSrc;
    } else {
      render();
    }
    return () => { cancelled = true; };
  }, [imageSrc, imageWidth, imageHeight, points, definitions]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = "LPNeC_Oculab_mapa_de_calor.png";
    anchor.click();
  };

  return <div className="heatmap-figure">
    <canvas ref={canvasRef} aria-label={imageSrc ? "Mapa de calor das fixações sobre o estímulo" : "Mapa de calor das fixações sobre fundo branco"} />
    <div className="heatmap-legend"><span>Menor densidade</span><i aria-hidden="true" /><span>Maior densidade</span><Button type="button" variant="outline" size="sm" onClick={download}><Download /> Baixar PNG</Button></div>
  </div>;
}

export default function OculabWorkspace({ isAdmin = false }: { isAdmin?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const presetInput = useRef<HTMLInputElement>(null);
  const aoiImageInput = useRef<HTMLInputElement>(null);
  const aoiImageRef = useRef<HTMLImageElement>(null);
  const pointerDragId = useRef<string | null>(null);
  const [step, setStep] = useState(0);
  const [datasets, setDatasets] = useState<UploadedDataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState("");
  const [metrics, setMetrics] = useState(defaultMetrics);
  const [customVariables, setCustomVariables] = useState<CustomVariableConfig[]>([]);
  const [outputDurationUnit, setOutputDurationUnit] = useState<"ms" | "s">("ms");
  const [amplitudeSource, setAmplitudeSource] = useState<"auto" | "fixation" | "saccade">("auto");
  const [excludeMissingStimulus, setExcludeMissingStimulus] = useState(true);
  const [outputSheets, setOutputSheets] = useState<EngineConfig["outputSheets"]>({ eventTrace: true, stimulusSummary: true, participantSummary: true, analysisMatrix: true });
  const [outputLayout, setOutputLayout] = useState<"long" | "wide" | "both">("both");
  const [aoiConfig, setAoiConfig] = useState<AoiConfig>(defaultAoiConfig);
  const [aoiReferenceImage, setAoiReferenceImage] = useState("");
  const [aoiImageSize, setAoiImageSize] = useState({ width: 0, height: 0 });
  const [aoiDrawStart, setAoiDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [aoiDrawCurrent, setAoiDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [chartMetric, setChartMetric] = useState("Duracao_Fixacao_Media");
  const [aoiChartMetric, setAoiChartMetric] = useState("Tempo_Total_Permanencia_Medio");
  const [heatmapStimulus, setHeatmapStimulus] = useState("__all__");
  const [heatmapParticipant, setHeatmapParticipant] = useState("__all__");
  const [heatmapGroup, setHeatmapGroup] = useState("__all__");
  const [error, setError] = useState("");

  const activeDataset = datasets.find((dataset) => dataset.id === activeDatasetId) ?? datasets[0];
  const rows = activeDataset?.rows ?? [];
  const headers = activeDataset?.headers ?? [];
  const mapping = activeDataset?.mapping ?? {};
  const totalRows = datasets.reduce((sum, dataset) => sum + dataset.rows.length, 0);
  const fileName = datasets.length === 1 ? fileStem(datasets[0].fileName) : `lote_${datasets.length}_arquivos`;
  const mappedCount = mappingFields.filter((field) => Boolean(mapping[field.key])).length;
  const requiredReady = Boolean(activeDataset?.mapping.eventType && activeDataset.fixationLabel.trim() && activeDataset.saccadeLabel.trim());
  const allMappingsReady = datasets.length > 0 && datasets.every((dataset) => dataset.mapping.eventType && dataset.fixationLabel.trim() && dataset.saccadeLabel.trim());
  const selectedAoiMetricCount = aoiConfig.enabled ? Object.values(aoiConfig.metrics).filter(Boolean).length : 0;
  const selectedMetricCount = Object.values(metrics).filter(Boolean).length + customVariables.length + selectedAoiMetricCount;
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
      aoiBinaryMappings: {},
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
    setAoiReferenceImage("/demo/estimulo_oculab.svg");
    setAoiImageSize({ width: 1280, height: 720 });
    setAoiConfig({
      enabled: true,
      mode: "coordinates",
      timestampUnit: "ms",
      coordinateSpace: "pixels",
      imageWidth: 1280,
      imageHeight: 720,
      metrics: defaultAoiMetrics,
      definitions: [
        { id: "demo-title", name: "Título", stimulus: "Estimulo_01.JPG", xMin: 72, yMin: 92, xMax: 610, yMax: 300 },
        { id: "demo-image", name: "Imagem principal", stimulus: "Estimulo_01.JPG", xMin: 690, yMin: 90, xMax: 1200, yMax: 555 },
        { id: "demo-action", name: "Botão de ação", stimulus: "Estimulo_01.JPG", xMin: 76, yMin: 505, xMax: 410, yMax: 622 },
      ],
    });
    setHeatmapStimulus("Estimulo_01.JPG");
    setHeatmapParticipant("__all__");
    setHeatmapGroup("__all__");
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

  const addAoiDefinition = (bounds?: Pick<AoiDefinition, "xMin" | "yMin" | "xMax" | "yMax">) => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setAoiConfig((current) => ({
      ...current,
      definitions: [...current.definitions, {
        id,
        name: `AOI ${current.definitions.length + 1}`,
        stimulus: "",
        xMin: bounds?.xMin ?? null,
        yMin: bounds?.yMin ?? null,
        xMax: bounds?.xMax ?? null,
        yMax: bounds?.yMax ?? null,
      }],
    }));
    setResult(null);
  };

  const updateAoiDefinition = (id: string, patch: Partial<AoiDefinition>) => {
    setAoiConfig((current) => ({ ...current, definitions: current.definitions.map((definition) => definition.id === id ? { ...definition, ...patch } : definition) }));
    setResult(null);
  };

  const removeAoiDefinition = (id: string) => {
    setAoiConfig((current) => ({ ...current, definitions: current.definitions.filter((definition) => definition.id !== id) }));
    setDatasets((current) => current.map((dataset) => ({ ...dataset, aoiBinaryMappings: Object.fromEntries(Object.entries(dataset.aoiBinaryMappings).filter(([key]) => key !== id)) })));
    setResult(null);
  };

  const numberOrNull = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    return value.trim() && Number.isFinite(parsed) ? parsed : null;
  };

  const onAoiImage = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const source = typeof reader.result === "string" ? reader.result : "";
      setAoiReferenceImage(source);
      if (!source) return;
      const image = new Image();
      image.onload = () => {
        const size = { width: image.naturalWidth, height: image.naturalHeight };
        setAoiImageSize(size);
        setAoiConfig((current) => ({ ...current, imageWidth: size.width, imageHeight: size.height }));
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  };

  const pointOnAoiImage = (event: ReactPointerEvent<HTMLDivElement>) => {
    const image = aoiImageRef.current;
    if (!image || !aoiImageSize.width || !aoiImageSize.height) return null;
    const rect = image.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(aoiImageSize.width, ((event.clientX - rect.left) / rect.width) * aoiImageSize.width)),
      y: Math.max(0, Math.min(aoiImageSize.height, ((event.clientY - rect.top) / rect.height) * aoiImageSize.height)),
    };
  };

  const finishAoiDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    const end = pointOnAoiImage(event) ?? aoiDrawCurrent;
    if (aoiDrawStart && end && Math.abs(end.x - aoiDrawStart.x) >= 3 && Math.abs(end.y - aoiDrawStart.y) >= 3) {
      addAoiDefinition({
        xMin: Math.round(Math.min(aoiDrawStart.x, end.x)),
        yMin: Math.round(Math.min(aoiDrawStart.y, end.y)),
        xMax: Math.round(Math.max(aoiDrawStart.x, end.x)),
        yMax: Math.round(Math.max(aoiDrawStart.y, end.y)),
      });
    }
    setAoiDrawStart(null);
    setAoiDrawCurrent(null);
  };

  const normalizedRows = useMemo(() => normalizeBatchRows(datasets, outputDurationUnit, customVariables, aoiConfig), [datasets, outputDurationUnit, customVariables, aoiConfig]);
  const observedMoments = useMemo(() => Array.from(new Set(normalizedRows.map((row) => String(row[batchMapping.moment!] ?? "").trim() || "Momento único"))), [normalizedRows]);
  const studyDesign = observedMoments.length > 1 ? "longitudinal" as const : "cross-sectional" as const;
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
      aoi: false,
    },
    studyDesign,
    outputLayout,
    fixationLabel: "Fixation",
    saccadeLabel: "Saccade",
    durationUnit: outputDurationUnit,
    outputDurationUnit,
    amplitudeSource,
    finalWeighting: "stimulus",
    countAggregation: "mean",
    excludeMissingStimulus,
    outputSheets,
    moments: observedMoments,
    groupOrder: batchGroups,
    groupAliases: {},
    metrics,
    customVariables,
    aoi: aoiConfig,
  }), [datasets, studyDesign, outputLayout, outputDurationUnit, amplitudeSource, excludeMissingStimulus, outputSheets, observedMoments, metrics, batchGroups, customVariables, aoiConfig]);

  const run = () => {
    try {
      if (!selectedMetricCount) throw new Error("Selecione pelo menos uma variável para tabular.");
      if (!datasets.length) throw new Error("Adicione pelo menos um arquivo ao lote.");
      if (!allMappingsReady) throw new Error("Mapeie o tipo de evento em todos os arquivos do lote.");
      const duplicateNames = customVariables.map((variable) => variable.label.trim().toLocaleLowerCase()).filter((name, index, values) => !name || values.indexOf(name) !== index);
      if (duplicateNames.length) throw new Error("Dê um nome diferente e não vazio para cada variável adicional.");
      const unmappedCustom = customVariables.filter((variable) => !datasets.some((dataset) => dataset.customMappings[variable.id]));
      if (unmappedCustom.length) throw new Error(`Escolha uma coluna de origem para: ${unmappedCustom.map((variable) => variable.label).join(", ")}.`);
      if (aoiConfig.enabled) {
        if (!selectedAoiMetricCount) throw new Error("Selecione pelo menos uma métrica para a análise de AOIs.");
        if (aoiConfig.mode === "labels" && datasets.some((dataset) => !dataset.mapping.aoi)) throw new Error("Selecione, em cada arquivo, a coluna que contém o nome da AOI.");
        if (aoiConfig.mode !== "labels") {
          if (!aoiConfig.definitions.length) throw new Error("Adicione pelo menos uma área de interesse.");
          const names = aoiConfig.definitions.map((definition) => definition.name.trim().toLocaleLowerCase());
          if (names.some((name) => !name) || new Set(names).size !== names.length) throw new Error("Dê um nome único e não vazio para cada AOI.");
        }
        if (aoiConfig.mode === "binary" && datasets.some((dataset) => aoiConfig.definitions.some((definition) => !dataset.aoiBinaryMappings[definition.id]))) throw new Error("Relacione cada AOI à sua coluna 0/1 em todos os arquivos.");
        if (aoiConfig.mode === "coordinates") {
          if (datasets.some((dataset) => !dataset.mapping.gazeX || !dataset.mapping.gazeY)) throw new Error("Selecione as colunas de coordenada X e Y em todos os arquivos.");
          if (aoiConfig.definitions.some((definition) => [definition.xMin, definition.yMin, definition.xMax, definition.yMax].some((value) => value === null))) throw new Error("Preencha os quatro limites de cada AOI ou desenhe as áreas sobre uma imagem.");
        }
      }
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
    const blob = new Blob([JSON.stringify({ ...config, mapping: activeDataset?.mapping ?? {}, datasetSettings: activeDataset ? { fixationLabel: activeDataset.fixationLabel, saccadeLabel: activeDataset.saccadeLabel, customMappings: activeDataset.customMappings, aoiBinaryMappings: activeDataset.aoiBinaryMappings } : undefined }, null, 2)], { type: "application/json" });
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
      const saved = JSON.parse(await file.text()) as Partial<EngineConfig> & { datasetSettings?: Partial<Pick<UploadedDataset, "fixationLabel" | "saccadeLabel" | "customMappings" | "aoiBinaryMappings">> };
      if (saved.mapping && activeDataset) patchDataset(activeDataset.id, { mapping: saved.mapping, ...saved.datasetSettings });
      if (saved.metrics) setMetrics((current) => ({ ...current, ...saved.metrics }));
      if (saved.customVariables) setCustomVariables(saved.customVariables);
      if (saved.outputLayout) setOutputLayout(saved.outputLayout);
      if (saved.outputDurationUnit) setOutputDurationUnit(saved.outputDurationUnit);
      if (saved.amplitudeSource) setAmplitudeSource(saved.amplitudeSource);
      if (typeof saved.excludeMissingStimulus === "boolean") setExcludeMissingStimulus(saved.excludeMissingStimulus);
      if (saved.outputSheets) setOutputSheets(saved.outputSheets);
      if (saved.aoi) setAoiConfig((current) => ({ ...current, ...saved.aoi, metrics: { ...current.metrics, ...saved.aoi?.metrics } }));
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
    const moments = Array.from(new Set(normalizedRows.map((row) => row.__moment)));
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
  }, [result, activeChartMetric]);

  const showLineChart = studyDesign === "longitudinal" && chart.moments.length > 1;

  const availableAoiChartMetrics = useMemo(() => aoiChartMetricOptions.filter((option) => aoiConfig.metrics[option.metric]), [aoiConfig.metrics]);
  const activeAoiChartMetric = availableAoiChartMetrics.find((option) => option.key === aoiChartMetric) ?? availableAoiChartMetrics[0];
  const aoiChart = useMemo(() => {
    if (!result || !activeAoiChartMetric) return { data: [] as Record<string, string | number | null>[], groups: [] as string[] };
    const groups = Array.from(new Set(result.aoiByGroup.map((row) => String(row.Grupo ?? "Grupo não informado"))));
    const aois = Array.from(new Set(result.aoiByGroup.map((row) => String(row.AOI ?? "")).filter(Boolean)));
    const data = aois.map((aoi) => {
      const item: Record<string, string | number | null> = { AOI: aoi };
      for (const group of groups) {
        const values = result.aoiByGroup
          .filter((row) => row.AOI === aoi && String(row.Grupo ?? "Grupo não informado") === group)
          .map((row) => row[activeAoiChartMetric.key])
          .filter((value): value is number => typeof value === "number");
        item[group] = values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
      }
      return item;
    });
    return { data, groups };
  }, [result, activeAoiChartMetric]);

  const heatmapOptions = useMemo(() => {
    const points = result?.heatmapPoints ?? [];
    return {
      stimuli: Array.from(new Set(points.map((point) => point.Estimulo))).filter(Boolean),
      participants: Array.from(new Set(points.map((point) => point.Participante))).filter(Boolean),
      groups: Array.from(new Set(points.map((point) => point.Grupo))).filter(Boolean),
    };
  }, [result]);
  const filteredHeatmapPoints = useMemo(() => (result?.heatmapPoints ?? []).filter((point) =>
    (heatmapStimulus === "__all__" || point.Estimulo === heatmapStimulus)
    && (heatmapParticipant === "__all__" || point.Participante === heatmapParticipant)
    && (heatmapGroup === "__all__" || point.Grupo === heatmapGroup)), [result, heatmapStimulus, heatmapParticipant, heatmapGroup]);
  const visibleHeatmapDefinitions = useMemo(() => aoiConfig.definitions.filter((definition) =>
    !definition.stimulus.trim() || heatmapStimulus === "__all__" || definition.stimulus === heatmapStimulus), [aoiConfig.definitions, heatmapStimulus]);
  const filteredHeatmapFixationCount = useMemo(() => new Set(filteredHeatmapPoints.map((point) =>
    [point.Arquivo, point.Participante, point.Momento, point.Estimulo, point.Tentativa, point.Fixacao_ID].join("␟"))).size, [filteredHeatmapPoints]);
  const heatmapCanvasSize = useMemo(() => {
    const definitionX = visibleHeatmapDefinitions.flatMap((definition) => [definition.xMin, definition.xMax]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const definitionY = visibleHeatmapDefinitions.flatMap((definition) => [definition.yMin, definition.yMax]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const maxX = Math.max(0, ...filteredHeatmapPoints.map((point) => point.X), ...definitionX);
    const maxY = Math.max(0, ...filteredHeatmapPoints.map((point) => point.Y), ...definitionY);
    const normalized = maxX > 0 && maxX <= 1 && maxY > 0 && maxY <= 1;
    return {
      width: aoiImageSize.width || aoiConfig.imageWidth || (normalized ? 1280 : Math.max(640, Math.ceil(maxX * 1.05))),
      height: aoiImageSize.height || aoiConfig.imageHeight || (normalized ? 720 : Math.max(360, Math.ceil(maxY * 1.05))),
    };
  }, [aoiImageSize, aoiConfig.imageWidth, aoiConfig.imageHeight, filteredHeatmapPoints, visibleHeatmapDefinitions]);

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
          <div className="brand-copy"><strong>LPNeC <span>Oculab</span></strong><small>Percepção · Neurociências</small></div>
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
              <p className="eyebrow">Laboratório de Percepção, Neurociências e Comportamento</p>
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
          <section className="stage internal-start">
            <div className="internal-start-main">
              <span className="internal-start-label">Área de trabalho</span>
              <h2>Inicie uma nova tabulação.</h2>
              <p>Adicione as planilhas brutas, identifique os participantes e siga as etapas laterais até revisar e exportar o resultado.</p>
              <Button size="lg" onClick={() => setStep(1)}>Importar dados <UploadCloud /></Button>
            </div>
            <aside className="internal-start-checklist" aria-label="Antes de importar">
              <span>Antes de importar</span>
              <ul>
                <li><CircleCheck /><span>Separe um identificador sem dados pessoais para cada participante.</span></li>
                <li><CircleCheck /><span>Tenha em mãos o grupo e o momento de coleta de cada arquivo.</span></li>
                <li><CircleCheck /><span>Confirme se as durações estão registradas em milissegundos ou segundos.</span></li>
              </ul>
            </aside>
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

              <Card className="config-card aoi-config-card">
                <CardHeader className="aoi-card-head"><div><CardTitle>Áreas de interesse (AOIs)</CardTitle><CardDescription>Ative apenas quando quiser comparar regiões específicas do estímulo.</CardDescription></div><Switch checked={aoiConfig.enabled} onCheckedChange={(enabled) => { setAoiConfig((current) => ({ ...current, enabled })); setResult(null); }} aria-label="Ativar análise de AOIs" /></CardHeader>
                <CardContent className="form-stack">
                  {!aoiConfig.enabled ? <div className="aoi-off-state"><Focus /><div><strong>Análise opcional</strong><span>A tabulação padrão continua igual. Ao ativar, o Excel ganha guias próprias para AOIs.</span></div></div> : <>
                    <div><Label>Como as AOIs aparecem nos arquivos?</Label><div className="aoi-mode-grid" role="radiogroup" aria-label="Origem das AOIs">
                      {([
                        { value: "labels", title: "Nome da AOI em uma coluna", detail: "Use quando cada linha já informa a região observada." },
                        { value: "binary", title: "Uma coluna 0/1 por AOI", detail: "Use exportações que marcam cada região com sim/não ou 1/0." },
                        { value: "coordinates", title: "Somente coordenadas X e Y", detail: "Desenhe ou informe os limites das regiões no próprio Oculab." },
                      ] as const).map((option) => <button type="button" role="radio" aria-checked={aoiConfig.mode === option.value} className={aoiConfig.mode === option.value ? "aoi-mode active" : "aoi-mode"} key={option.value} onClick={() => { setAoiConfig((current) => ({ ...current, mode: option.value })); setResult(null); }}><strong>{option.title}</strong><span>{option.detail}</span></button>)}
                    </div></div>

                    <div className="aoi-subsection"><div className="aoi-section-title"><div><strong>Colunas de cada arquivo</strong><span>O Oculab permite que arquivos diferentes usem nomes de coluna diferentes.</span></div></div>
                      {datasets.map((dataset) => <div className="aoi-file-row" key={dataset.id}><strong>{dataset.fileName}</strong><div className="aoi-file-fields">
                        {aoiConfig.mode === "labels" && <div><Label>Coluna com o nome da AOI</Label><Select value={dataset.mapping.aoi ?? "__none__"} onValueChange={(value) => patchDataset(dataset.id, { mapping: { ...dataset.mapping, aoi: value === "__none__" ? undefined : value } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Selecionar coluna</SelectItem>{dataset.headers.map((header) => <SelectItem value={header} key={header}>{header}</SelectItem>)}</SelectContent></Select></div>}
                        {aoiConfig.mode === "coordinates" && <><div><Label>Coordenada X</Label><Select value={dataset.mapping.gazeX ?? "__none__"} onValueChange={(value) => patchDataset(dataset.id, { mapping: { ...dataset.mapping, gazeX: value === "__none__" ? undefined : value } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Selecionar coluna</SelectItem>{dataset.headers.map((header) => <SelectItem value={header} key={header}>{header}</SelectItem>)}</SelectContent></Select></div><div><Label>Coordenada Y</Label><Select value={dataset.mapping.gazeY ?? "__none__"} onValueChange={(value) => patchDataset(dataset.id, { mapping: { ...dataset.mapping, gazeY: value === "__none__" ? undefined : value } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Selecionar coluna</SelectItem>{dataset.headers.map((header) => <SelectItem value={header} key={header}>{header}</SelectItem>)}</SelectContent></Select></div></>}
                        {aoiConfig.metrics.ttff && <div><Label>Tempo / timestamp (opcional)</Label><Select value={dataset.mapping.timestamp ?? "__none__"} onValueChange={(value) => patchDataset(dataset.id, { mapping: { ...dataset.mapping, timestamp: value === "__none__" ? undefined : value } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Não informar</SelectItem>{dataset.headers.map((header) => <SelectItem value={header} key={header}>{header}</SelectItem>)}</SelectContent></Select></div>}
                      </div></div>)}
                    </div>

                    {aoiConfig.mode === "coordinates" && <div className="aoi-subsection"><div className="aoi-section-title"><div><strong>Desenhe as regiões</strong><span>Envie uma imagem do estímulo e arraste para criar retângulos. As coordenadas também podem ser ajustadas abaixo.</span></div><Button type="button" variant="outline" size="sm" onClick={() => aoiImageInput.current?.click()}><UploadCloud /> Escolher imagem</Button><input ref={aoiImageInput} type="file" accept="image/*" hidden onChange={(event) => onAoiImage(event.target.files?.[0])} /></div>
                      <div className="aoi-coordinate-space"><div><strong>Escala das coordenadas</strong><span>Use “detectar automaticamente” na maioria dos arquivos. O Oculab reconhece valores entre 0 e 1 e também redimensiona coordenadas de tela maiores que a imagem, sem descartar fixações.</span></div><Select value={aoiConfig.coordinateSpace ?? "auto"} onValueChange={(coordinateSpace) => setAoiConfig((current) => ({ ...current, coordinateSpace: coordinateSpace as NonNullable<AoiConfig["coordinateSpace"]> }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Detectar automaticamente</SelectItem><SelectItem value="pixels">Pixels da imagem</SelectItem><SelectItem value="normalized">Valores entre 0 e 1</SelectItem></SelectContent></Select></div>
                      {aoiReferenceImage ? <div className="aoi-draw-area" onPointerDown={(event) => { const point = pointOnAoiImage(event); if (!point) return; event.currentTarget.setPointerCapture(event.pointerId); setAoiDrawStart(point); setAoiDrawCurrent(point); }} onPointerMove={(event) => { if (aoiDrawStart) setAoiDrawCurrent(pointOnAoiImage(event)); }} onPointerUp={finishAoiDrawing} onPointerCancel={() => { setAoiDrawStart(null); setAoiDrawCurrent(null); }}>
                        {/* A imagem é local e temporária; não deve passar pelo otimizador remoto. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img ref={aoiImageRef} src={aoiReferenceImage} alt="Referência para desenhar áreas de interesse" draggable={false} onLoad={(event) => { const size = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }; setAoiImageSize(size); setAoiConfig((current) => ({ ...current, imageWidth: size.width, imageHeight: size.height })); }} />
                        {aoiConfig.definitions.filter((definition) => definition.xMin !== null && definition.yMin !== null && definition.xMax !== null && definition.yMax !== null).map((definition, index) => <span className="aoi-overlay" key={definition.id} style={{ left: `${(Math.min(definition.xMin!, definition.xMax!) / aoiImageSize.width) * 100}%`, top: `${(Math.min(definition.yMin!, definition.yMax!) / aoiImageSize.height) * 100}%`, width: `${(Math.abs(definition.xMax! - definition.xMin!) / aoiImageSize.width) * 100}%`, height: `${(Math.abs(definition.yMax! - definition.yMin!) / aoiImageSize.height) * 100}%` }}><b>{index + 1}</b>{definition.name}</span>)}
                        {aoiDrawStart && aoiDrawCurrent && <span className="aoi-overlay drawing" style={{ left: `${(Math.min(aoiDrawStart.x, aoiDrawCurrent.x) / aoiImageSize.width) * 100}%`, top: `${(Math.min(aoiDrawStart.y, aoiDrawCurrent.y) / aoiImageSize.height) * 100}%`, width: `${(Math.abs(aoiDrawCurrent.x - aoiDrawStart.x) / aoiImageSize.width) * 100}%`, height: `${(Math.abs(aoiDrawCurrent.y - aoiDrawStart.y) / aoiImageSize.height) * 100}%` }} />}
                      </div> : <button type="button" className="aoi-image-empty" onClick={() => aoiImageInput.current?.click()}><Focus /><strong>Adicionar imagem de referência</strong><span>Depois, arraste sobre a imagem para marcar cada AOI.</span></button>}
                    </div>}

                    {aoiConfig.mode !== "labels" && <div className="aoi-subsection"><div className="aoi-section-title"><div><strong>Áreas configuradas</strong><span>{aoiConfig.mode === "binary" ? "Dê um nome à AOI e relacione a coluna correspondente em cada arquivo." : "Revise o nome, o estímulo e os limites em pixels."}</span></div><Button type="button" variant="outline" size="sm" onClick={() => addAoiDefinition()}><Plus /> Adicionar AOI</Button></div>
                      {aoiConfig.definitions.length === 0 ? <div className="empty-state compact">Nenhuma AOI adicionada.</div> : <div className="aoi-definition-list">{aoiConfig.definitions.map((definition, index) => <div className="aoi-definition" key={definition.id}><div className="aoi-definition-head"><Badge>{index + 1}</Badge><Input value={definition.name} onChange={(event) => updateAoiDefinition(definition.id, { name: event.target.value })} aria-label={`Nome da AOI ${index + 1}`} /><Button type="button" variant="ghost" size="icon" onClick={() => removeAoiDefinition(definition.id)} aria-label={`Remover ${definition.name}`}><Trash2 /></Button></div>
                        {aoiConfig.mode === "binary" ? <div className="aoi-binary-map">{datasets.map((dataset) => <div key={dataset.id}><Label>{dataset.fileName}</Label><Select value={dataset.aoiBinaryMappings[definition.id] ?? "__none__"} onValueChange={(value) => patchDataset(dataset.id, { aoiBinaryMappings: { ...dataset.aoiBinaryMappings, [definition.id]: value === "__none__" ? "" : value } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Selecionar coluna 0/1</SelectItem>{dataset.headers.map((header) => <SelectItem value={header} key={header}>{header}</SelectItem>)}</SelectContent></Select></div>)}</div> : <div className="aoi-coordinate-grid"><div><Label>Estímulo (opcional)</Label><Input value={definition.stimulus} onChange={(event) => updateAoiDefinition(definition.id, { stimulus: event.target.value })} placeholder="Vazio = todos os estímulos" /></div>{(["xMin", "yMin", "xMax", "yMax"] as const).map((field) => <div key={field}><Label>{field === "xMin" ? "X inicial" : field === "yMin" ? "Y inicial" : field === "xMax" ? "X final" : "Y final"}</Label><Input inputMode="decimal" value={definition[field] ?? ""} onChange={(event) => updateAoiDefinition(definition.id, { [field]: numberOrNull(event.target.value) })} /></div>)}</div>}
                      </div>)}</div>}
                    </div>}

                    <div className="aoi-subsection"><div className="aoi-section-title"><div><strong>Métricas no resultado</strong><span>Cada medida aparecerá em guias próprias por participante e por grupo.</span></div></div><div className="aoi-metrics-grid">{aoiMetricFields.map((metric) => <div className="metric-row" key={metric.key}><div><strong>{metric.label}</strong><span>{metric.detail}</span></div><Switch checked={aoiConfig.metrics[metric.key]} onCheckedChange={(checked) => { setAoiConfig((current) => ({ ...current, metrics: { ...current.metrics, [metric.key]: checked } })); setResult(null); }} /></div>)}</div>
                      {aoiConfig.metrics.ttff && <div className="aoi-timestamp-unit"><div><strong>Unidade da coluna de tempo</strong><span>Usada somente quando uma coluna de tempo for informada. Sem timestamp, o TTFF fica vazio; mapa de calor, permanência e contagens continuam funcionando.</span></div><Select value={aoiConfig.timestampUnit} onValueChange={(timestampUnit) => setAoiConfig((current) => ({ ...current, timestampUnit: timestampUnit as "ms" | "s" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ms">Milissegundos</SelectItem><SelectItem value="s">Segundos</SelectItem></SelectContent></Select></div>}
                    </div>
                  </>}
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
              <div><span>Linhas na base estatística</span><strong>{result.level2.length.toLocaleString("pt-BR")}</strong><small>participantes e momentos observados</small></div>
            </div>

            <Tabs defaultValue={outputSheets.eventTrace ? "level1" : outputSheets.stimulusSummary ? "stimulus" : "level2"} className="result-tabs">
              <TabsList variant="line" className="tabs-list"><TabsTrigger value="level1">Fase 1 · rastreio</TabsTrigger><TabsTrigger value="stimulus">Fase 2 · resumo</TabsTrigger><TabsTrigger value="level2">Fase 3 · dados longos</TabsTrigger><TabsTrigger value="wide">Fase 3 · dados amplos</TabsTrigger>{aoiConfig.enabled && <TabsTrigger value="aoi">Análise de AOIs</TabsTrigger>}{aoiConfig.enabled && aoiConfig.mode === "coordinates" && <TabsTrigger value="heatmap">Mapa de calor</TabsTrigger>}<TabsTrigger value="chart">Visão geral</TabsTrigger><TabsTrigger value="audit">Auditoria</TabsTrigger></TabsList>
              <TabsContent value="level1"><div className="tab-heading"><div><strong>Eventos organizados por estímulo</strong><span>A tabela preserva a ordem dos eventos. Quando houver uma sacada imediatamente após uma fixação, ambas aparecem na mesma linha; as demais sacadas continuam na coluna de duração de sacadas.</span></div><Badge variant="outline">{result.summary.fixationEvents} fixações · {result.summary.saccadeEvents} sacadas</Badge></div><DataTable rows={level1Preview} headerLabel={friendlyHeader} /></TabsContent>
              <TabsContent value="stimulus"><div className="tab-heading"><div><strong>Resumo por estímulo ou slide</strong><span>Cada linha reúne as medidas de um estímulo. No Excel, as linhas destacadas ao final de cada participante mostram média ou total e desvio-padrão.</span></div><Badge variant="outline">{result.byStimulus.length} linhas</Badge></div><DataTable rows={result.byStimulus} headerLabel={friendlyHeader} /></TabsContent>
              <TabsContent value="level2"><div className="tab-heading"><div><strong>Formato longo para SPSS/JASP</strong><span>Cada linha representa a combinação entre um participante e um momento. Este formato é indicado para modelos que analisam observações repetidas em linhas.</span></div><Badge variant="outline">{result.level2.length} linhas</Badge></div><DataTable rows={result.level2} headerLabel={friendlyHeader} /></TabsContent>
              <TabsContent value="wide"><div className="tab-heading"><div><strong>Formato amplo para medidas repetidas</strong><span>Cada participante ocupa uma única linha. As medidas de cada momento aparecem em colunas separadas.</span></div><Badge variant="outline">{result.level2Wide.length} linhas</Badge></div><DataTable rows={result.level2Wide} headerLabel={friendlyHeader} /></TabsContent>
              {aoiConfig.enabled && <TabsContent value="aoi"><div className="aoi-results"><div className="tab-heading"><div><strong>Comparação entre áreas de interesse</strong><span>As barras apresentam uma síntese descritiva por grupo. As tabelas preservam os resultados individuais para análise.</span></div><Badge variant="outline">{result.aoiByParticipant.length} combinações</Badge></div>
                <div className="chart-metric-picker" role="tablist" aria-label="Métrica de AOI exibida no gráfico">{availableAoiChartMetrics.map((option) => <button key={option.key} type="button" role="tab" aria-selected={activeAoiChartMetric?.key === option.key} className={activeAoiChartMetric?.key === option.key ? "active" : ""} onClick={() => setAoiChartMetric(option.key)}>{option.label}</button>)}</div>
                {aoiChart.data.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={aoiChart.data} margin={{ top: 15, right: 24, bottom: 10, left: 2 }}><CartesianGrid strokeDasharray="3 3" stroke="#dbe4ec" /><XAxis dataKey="AOI" tick={{ fill: "#526477", fontSize: 12 }} /><YAxis tick={{ fill: "#526477", fontSize: 12 }} /><Tooltip formatter={(value) => [typeof value === "number" ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : value, activeAoiChartMetric?.label ?? "Valor"]} contentStyle={{ borderRadius: 12, border: "1px solid #dbe4ec" }} /><Legend />{aoiChart.groups.map((group, index) => <Bar key={group} dataKey={group} fill={colors[index % colors.length]} radius={[5, 5, 0, 0]} maxBarSize={70} />)}</BarChart></ResponsiveContainer></div> : <div className="empty-state">Nenhuma AOI foi identificada. Confira as colunas e os limites configurados.</div>}
                <div className="aoi-result-tables"><div><h3>Por participante</h3><DataTable rows={result.aoiByParticipant} headerLabel={friendlyHeader} /></div><div><h3>Por grupo</h3><DataTable rows={result.aoiByGroup} headerLabel={friendlyHeader} /></div></div>
              </div></TabsContent>}
              {aoiConfig.enabled && aoiConfig.mode === "coordinates" && <TabsContent value="heatmap"><div className="heatmap-panel">
                <div className="tab-heading"><div><strong>Distribuição completa das fixações</strong><span>O mapa usa todas as amostras válidas de fixação encontradas na tela. As AOIs aparecem apenas como contornos de referência e não filtram os pontos.</span></div><Badge variant="outline">{filteredHeatmapPoints.length} amostras · {filteredHeatmapFixationCount} fixações</Badge></div>
                <div className="heatmap-controls">
                  <div><Label>Estímulo</Label><Select value={heatmapStimulus} onValueChange={setHeatmapStimulus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos os estímulos</SelectItem>{heatmapOptions.stimuli.map((value) => <SelectItem value={value} key={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Participante</Label><Select value={heatmapParticipant} onValueChange={setHeatmapParticipant}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos os participantes</SelectItem>{heatmapOptions.participants.map((value) => <SelectItem value={value} key={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Grupo</Label><Select value={heatmapGroup} onValueChange={setHeatmapGroup}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos os grupos</SelectItem>{heatmapOptions.groups.map((value) => <SelectItem value={value} key={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="heatmap-method-note"><UploadCloud /><div><strong>Imagem de fundo opcional</strong><span>{aoiReferenceImage ? "A imagem atual será usada apenas como referência visual. Você pode substituí-la sem refazer a tabulação." : "Sem imagem, o Oculab gera o mapa completo sobre um fundo branco, preservando toda a extensão das coordenadas."}</span><Button type="button" variant="outline" size="sm" onClick={() => aoiImageInput.current?.click()}>{aoiReferenceImage ? "Trocar imagem" : "Adicionar imagem"}</Button><input ref={aoiImageInput} type="file" accept="image/*" hidden onChange={(event) => onAoiImage(event.target.files?.[0])} /></div></div>
                {filteredHeatmapPoints.length
                  ? <HeatmapCanvas imageSrc={aoiReferenceImage} imageWidth={heatmapCanvasSize.width} imageHeight={heatmapCanvasSize.height} points={filteredHeatmapPoints} definitions={visibleHeatmapDefinitions} />
                  : <div className="empty-state">Nenhuma amostra de fixação com coordenadas X e Y válidas corresponde aos filtros selecionados.</div>}
                <div className="heatmap-method-note"><Focus /><div><strong>Mapa de calor e percurso do olhar são medidas diferentes.</strong><span>O calor resume onde houve fixação e por quanto tempo. As coordenadas de sacadas não são tratadas como atenção; a sequência temporal completa deve ser interpretada como scanpath.</span></div></div>
              </div></TabsContent>}
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
