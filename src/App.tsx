import React, { useState, useEffect, useRef } from "react";
import {
  Sprout,
  Droplets,
  Thermometer,
  CloudRain,
  Cpu,
  Send,
  Copy,
  Check,
  AlertTriangle,
  History,
  Terminal,
  Compass,
  Layers,
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Info,
  Bot,
  X,
  MessageSquare,
} from "lucide-react";

// Interfaces de tipado
interface TelemetryParams {
  crop: "corn" | "soy";
  soil_type: "sandy" | "loamy" | "clayey";
  soil_moisture_pct: number;
  soil_temp_c: number;
  forecast_precip_24h_mm: number;
}

interface AnalysisOutput {
  status: string;
  metrics: {
    isi_score: number;
    classification: "OPTIMAL" | "FAVORABLE" | "MODERATE_RISK" | "NOT_RECOMMENDED";
    ui_color_code: string;
    confidence_level_pct: number;
    prescriptions: {
      seeding_depth_cm: number;
      density_seeds_ha: number;
      fertilization_strategy: string;
      fertilizer_dose_kg_ha?: number;
      fertilizer_type?: string;
      professional_fertilizer?: {
        recomendacion_principal: {
          nutrientes: string;
          dosis_poblada: string;
          dosis_valores: {
            n: number;
            p: number;
            k: number;
            s?: number;
          };
          unidades: string;
        };
        fuente_sugerida: {
          fertilizante: string;
          equivalencia_comercial: string;
        };
        rango_operativo: {
          dosis_minima: string;
          dosis_maxima: string;
        };
        impacto_esperado: {
          rendimiento_estimado: string;
          riesgo_asociado: string;
        };
      };
    };
    alerts: string[];
  };
  section_1: string;
  section_2: any;
  commentary: {
    executiveSummary: string;
    justificationDepth: string;
    justificationDensity: string;
    justificationFertilizer: string;
    finalRecommendation: string;
  };
}

export default function App() {
  // 1. Estado de los Parámetros
  const [params, setParams] = useState<TelemetryParams>({
    crop: "corn",
    soil_type: "sandy",
    soil_moisture_pct: 14,
    soil_temp_c: 15,
    forecast_precip_24h_mm: 35,
  });

  // Supabase states
  interface SupabaseStatus {
    configured: boolean;
    connected: boolean;
    tableExists: boolean;
    projectName: string;
    supabaseUrl: string | null;
    recordCount: number;
    errorMessage: string;
    schemaSql: string;
  }
  const [sbStatus, setSbStatus] = useState<SupabaseStatus | null>(null);
  const [sbLoading, setSbLoading] = useState<boolean>(true);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [formUrl, setFormUrl] = useState<string>("");
  const [formKey, setFormKey] = useState<string>("");
  const [savingCredentials, setSavingCredentials] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string>("");
  const [showConfigForm, setShowConfigForm] = useState<boolean>(false);

  // 2. Estados de Carga, Respuesta del Analizador y Chats
  const [loading, setLoading] = useState<boolean>(false);
  const [analysis, setAnalysis] = useState<AnalysisOutput | null>(null);
  const [activeTab, setActiveTab] = useState<"section1" | "section2">("section1");

  // Estado de Selección de Sector del Lote en el "FIELD INTELLIGENCE MAP"
  const [selectedSector, setSelectedSector] = useState<number>(14);

  // Estado del Chat con SmartSeed AI
  const [chatInput, setChatInput] = useState<string>("");
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<Array<{ sender: "user" | "bot"; text: string }>>([
    {
      sender: "bot",
      text: "¡Bienvenido, operador! Soy SmartSeed AI, tu copiloto de precisión Crucianelli. Modifica la telemetría a la izquierda y pregúntame lo que desees sobre este lote de campo.",
    },
  ]);
  const [isAssistantOpen, setIsAssistantOpen] = useState<boolean>(false);

  // Estados de notificación de copia
  const [copiedSection1, setCopiedSection1] = useState(false);
  const [copiedSection2, setCopiedSection2] = useState(false);

  // Módulo SMART HISTORY (Mejora 5)
  interface HistoryItem {
    id: string;
    date: string;
    crop: "corn" | "soy";
    soil_type: "sandy" | "loamy" | "clayey";
    soil_moisture_pct: number;
    soil_temp_c: number;
    forecast_precip_24h_mm: number;
    isi: number;
    recommendation: string;
  }

  const [smartHistory, setSmartHistory] = useState<HistoryItem[]>([
    {
      id: "h1",
      date: "21/06/2026",
      crop: "corn",
      soil_type: "loamy",
      soil_moisture_pct: 22,
      soil_temp_c: 16,
      forecast_precip_24h_mm: 15,
      isi: 80,
      recommendation: "Favorable",
    },
    {
      id: "h2",
      date: "22/06/2026",
      crop: "soy",
      soil_type: "clayey",
      soil_moisture_pct: 18,
      soil_temp_c: 11,
      forecast_precip_24h_mm: 5,
      isi: 72,
      recommendation: "Riesgo Moderado",
    },
  ]);

  // Fetch history and Supabase status on mount
  const fetchHistoryAndStatus = async () => {
    try {
      const statusRes = await fetch("/api/supabase-status");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setSbStatus(statusData);
      }

      const historyRes = await fetch("/api/history");
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        if (historyData.success && historyData.history) {
          setSmartHistory(historyData.history);
        }
      }
    } catch (err) {
      console.error("Error loading Supabase history and status:", err);
    } finally {
      setSbLoading(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUrl || !formKey) {
      setSaveError("Por favor ingrese tanto la URL como la Anon Key.");
      return;
    }
    setSavingCredentials(true);
    setSaveError("");
    try {
      const res = await fetch("/api/save-supabase-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: formUrl.trim(), key: formKey.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchHistoryAndStatus();
        setShowConfigForm(false);
      } else {
        setSaveError(data.error || "Error al conectar.");
      }
    } catch (err: any) {
      setSaveError(err.message || "Error al conectar al servidor.");
    } finally {
      setSavingCredentials(false);
    }
  };

  useEffect(() => {
    fetchHistoryAndStatus();
  }, []);

  const saveHistoryToBackend = async (item: HistoryItem) => {
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        // Refresh status for updated row count
        const statusRes = await fetch("/api/supabase-status");
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setSbStatus(statusData);
        }
      }
    } catch (err) {
      console.error("Failed to post history item to backend:", err);
    }
  };

  // Guardar de forma automatizada al cargar análisis nuevos (Mejora 5)
  useEffect(() => {
    if (!analysis) return;
    const currentIsi = analysis.metrics.isi_score;
    let friendlyRec = "Favorable";
    if (currentIsi >= 81) friendlyRec = "Óptimo";
    else if (currentIsi >= 60) friendlyRec = "Favorable";
    else if (currentIsi >= 41) friendlyRec = "Riesgo Moderado";
    else friendlyRec = "No Recomendable";

    const last = smartHistory[0];
    if (
      last &&
      last.crop === params.crop &&
      last.soil_type === params.soil_type &&
      last.soil_moisture_pct === params.soil_moisture_pct &&
      last.soil_temp_c === params.soil_temp_c &&
      last.forecast_precip_24h_mm === params.forecast_precip_24h_mm &&
      last.isi === currentIsi
    ) {
      return;
    }

    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, "0")}/${String(
      now.getMonth() + 1
    ).padStart(2, "0")}/${now.getFullYear()}`;

    const newItem: HistoryItem = {
      id: String(Date.now()),
      date: formattedDate,
      crop: params.crop,
      soil_type: params.soil_type,
      soil_moisture_pct: params.soil_moisture_pct,
      soil_temp_c: params.soil_temp_c,
      forecast_precip_24h_mm: params.forecast_precip_24h_mm,
      isi: currentIsi,
      recommendation: friendlyRec,
    };

    setSmartHistory((prev) => {
      const filtered = prev.filter((p) => p.id !== newItem.id);
      return [newItem, ...filtered].slice(0, 12);
    });
    saveHistoryToBackend(newItem);
  }, [analysis]);

  const loadHistoryItem = (item: HistoryItem) => {
    setParams({
      crop: item.crop,
      soil_type: item.soil_type,
      soil_moisture_pct: item.soil_moisture_pct,
      soil_temp_c: item.soil_temp_c,
      forecast_precip_24h_mm: item.forecast_precip_24h_mm,
    });
  };

  // 3. Efecto para recalcular automáticamente al cambiar sliders/selectores
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      triggerAnalysis();
    }, 450); // debounce para suavizar sliders
    return () => clearTimeout(delayDebounce);
  }, [params]);

  // 4. Request al servidor de back-end Express
  const triggerAnalysis = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await response.json();
      if (data.success) {
        setAnalysis({
          status: data.metrics.classification,
          metrics: data.metrics,
          section_1: data.section_1,
          section_2: data.section_2,
          commentary: data.commentary,
        });
      }
    } catch (err) {
      console.error("Error fetching analysis:", err);
    } finally {
      setLoading(false);
    }
  };

  // 5. Enviar mensaje de chat
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput("");
    setChatHistory((prev) => [...prev, { sender: "user", text: userMsg }]);
    setChatLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          telemetry: params,
        }),
      });
      const data = await response.json();
      setChatHistory((prev) => [...prev, { sender: "bot", text: data.reply || data.error }]);
    } catch (err) {
      console.error("Error in chat request:", err);
      setChatHistory((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "⚠️ Ocurrió un error en la transmisión de telemetría de satélite de SmartSeed. Verifique el servidor Express local.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleAssistantSuggestionSubmit = async (query: string) => {
    setChatHistory((prev) => [...prev, { sender: "user", text: query }]);
    setChatLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          telemetry: params,
        }),
      });
      const data = await response.json();
      setChatHistory((prev) => [...prev, { sender: "bot", text: data.reply || data.error }]);
    } catch (err) {
      console.error("Error in chat suggestion request:", err);
      setChatHistory((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "⚠️ Ocurrió un error en la transmisión de telemetría de satélite de SmartSeed. Verifique el servidor Express local.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Recargadores e intercambios
  const handleCopySection1 = () => {
    if (!analysis) return;
    navigator.clipboard.writeText(analysis.section_1);
    setCopiedSection1(true);
    setTimeout(() => setCopiedSection1(false), 2000);
  };

  const handleCopySection2 = () => {
    if (!analysis) return;
    navigator.clipboard.writeText(JSON.stringify(analysis.section_2, null, 2));
    setCopiedSection2(true);
    setTimeout(() => setCopiedSection2(false), 2000);
  };

  // 7. Lógica Estructurada para el "FIELD INTELLIGENCE MAP" interactivo
  const getSectorTelemetry = (index: number) => {
    const rowLetter = ["A", "B", "C", "D", "E", "F"][Math.floor(index / 6)];
    const colNumber = (index % 6) + 1;
    const name = `SECTOR LOTE ${rowLetter}-${colNumber}`;

    // Desviaciones estables basadas en el índice del bloque
    const offsetMoisture = Math.sin(index * 1.7) * 3.5;
    const localMoisture = Math.max(5, Math.min(50, Math.round(params.soil_moisture_pct + offsetMoisture)));

    const offsetTemp = Math.cos(index * 1.1) * 1.5;
    const localTemp = parseFloat(Math.max(2, Math.min(35, params.soil_temp_c + offsetTemp)).toFixed(1));

    // Cálculo simplificado de ISI del sector
    let moistureScore = 100;
    if (localMoisture < 15) {
      moistureScore = Math.max(20, (localMoisture / 15) * 80);
    } else if (localMoisture > 35) {
      moistureScore = Math.max(30, 100 - (localMoisture - 35) * 4);
    }
    const tempThreshold = params.crop === "soy" ? 12 : 10;
    let tempScore = 100;
    if (localTemp < tempThreshold) {
      tempScore = Math.max(10, 100 - (tempThreshold - localTemp) * 15);
    }
    const localIsi = Math.max(0, Math.min(100, Math.round(moistureScore * 0.5 + tempScore * 0.5)));

    // Código de color neón del sector
    let colorType = "red";
    let colorHex = "#FF0033";
    let labelColor = "text-[#FF0033]";
    if (localIsi >= 81) {
      colorType = "green";
      colorHex = "#00FF66";
      labelColor = "text-[#00FF66]";
    } else if (localIsi >= 41) {
      colorType = "amber";
      colorHex = "#FF9900";
      labelColor = "text-[#FF9900]";
    }

    const potentialYield = Math.max(50, Math.min(100, Math.round(55 + (localIsi * 0.45))));

    return {
      name,
      moisture: localMoisture,
      temp: localTemp,
      isi: localIsi,
      potential: potentialYield,
      colorType,
      colorHex,
      labelColor,
    };
  };

  const selectedSectorData = getSectorTelemetry(selectedSector);

  // Lógica Estilo y Clasificación
  const scoreValue = analysis?.metrics.isi_score ?? 50;

  const getIsiStyle = (score: number) => {
    if (score >= 81) {
      return {
        text: "text-[#00FF66]",
        border: "border-[#00FF66]/40",
        borderSolid: "border-[#00FF66]",
        bg: "bg-[#00FF66]/10",
        shadow: "shadow-[0_0_15px_rgba(0,255,102,0.1)]",
        hex: "#00FF66",
        rgb: "0, 255, 102",
        classText: "ÓPTIMO",
      };
    }
    if (score >= 60) {
      return {
        text: "text-[#FF9900]",
        border: "border-[#FF9900]/40",
        borderSolid: "border-[#FF9900]",
        bg: "bg-[#FF9900]/10",
        shadow: "shadow-[0_0_15px_rgba(255,153,0,0.1)]",
        hex: "#FF9900",
        rgb: "255, 153, 0",
        classText: "FAVORABLE",
      };
    }
    if (score >= 41) {
      return {
        text: "text-[#FF9900]",
        border: "border-[#FF9900]/40",
        borderSolid: "border-[#FF9900]",
        bg: "bg-[#FF9900]/10",
        shadow: "shadow-[0_0_15px_rgba(255,153,0,0.1)]",
        hex: "#FF9900",
        rgb: "255, 153, 0",
        classText: "RIESGO MODERADO",
      };
    }
    return {
      text: "text-[#FF0033]",
      border: "border-[#FF0033]/40",
      borderSolid: "border-[#FF0033]",
      bg: "bg-[#FF0033]/10",
      shadow: "shadow-[0_0_15px_rgba(255,0,51,0.1)]",
      hex: "#FF0033",
      rgb: "255, 0, 51",
      classText: "NO RECOMENDABLE",
    };
  };

  const uiTheme = getIsiStyle(scoreValue);

  // Interfaces para Alertas Inteligentes
  interface AlertItem {
    type: "CRITICAL" | "WARNING" | "OPPORTUNITY";
    title: string;
    desc: string;
  }

  // Helper para generar alertas inteligentes en base a sensores físicos (Prioridad 5)
  const getSmartAlerts = (): AlertItem[] => {
    const list: AlertItem[] = [];

    // Criticals (🔴)
    if (params.soil_moisture_pct < 15) {
      list.push({
        type: "CRITICAL",
        title: "🔴 ALERTA CRÍTICA",
        desc: "Humedad crítica superficial por debajo del 15%. Riesgo severo de desecación acelerada del germen.",
      });
    }
    if (params.soil_temp_c < (params.crop === "soy" ? 12 : 10)) {
      list.push({
        type: "CRITICAL",
        title: "🔴 ALERTA CRÍTICA",
        desc: `Temperatura crítica de suelo extremadamente baja (${params.soil_temp_c}°C). Letargo biológico bi-semanal detectado. Detenga la siembra.`,
      });
    }

    // Warnings (🟠)
    if (params.forecast_precip_24h_mm > 35) {
      list.push({
        type: "WARNING",
        title: "🟠 ATENCIÓN",
        desc: `Precipitación pronosticada de alta tasa (${params.forecast_precip_24h_mm} mm en 24h). Riesgo latente de encostramiento del suelo.`,
      });
    }
    if (params.soil_type === "sandy" && params.forecast_precip_24h_mm > 25) {
      list.push({
        type: "WARNING",
        title: "🟠 ATENCIÓN",
        desc: "Suelo arenoso de alta porosidad propenso a lixiviación severa de nitrógenos con las precipitaciones previstas.",
      });
    }

    // Opportunities (🟢)
    if (params.forecast_precip_24h_mm >= 5 && params.forecast_precip_24h_mm <= 30 && params.soil_moisture_pct >= 15) {
      list.push({
        type: "OPPORTUNITY",
        title: "🟢 OPORTUNIDAD",
        desc: "Volumen pluvial óptimo proyectado. Activación ideal para acelerar la solubilización de fertilizantes de base granulada.",
      });
    }
    if (params.soil_type === "loamy") {
      list.push({
        type: "OPPORTUNITY",
        title: "🟢 OPORTUNIDAD",
        desc: "Horizonte A franco. Óptima porosidad de retención capilar hídrica con drenaje natural estabilizado.",
      });
    }

    // Fallback if list is empty
    if (list.length === 0) {
      list.push({
        type: "OPPORTUNITY",
        title: "🟢 OPORTUNIDAD",
        desc: "Equilibrio biótico de horizontes óptimo. Perfil hídrico y térmico completamente alineado con la especie.",
      });
    }

    return list;
  };

  const smartAlerts = getSmartAlerts();

  // Helper para recomendación unificada e inmediata (Prioridad 1)
  const getDynamicAdvisory = () => {
    let recommendation = "Se recomienda sembrar durante las próximas 24-48 horas aprovechando la lluvia prevista.";
    let danger = "Ninguno detectado. Condiciones de biomasa estables.";

    if (scoreValue >= 81) {
      recommendation = "Se recomienda sembrar inmediatamente durante las próximas 24-48 horas, aprovechando la interacción perfecta de calor y humedad inicial.";
      danger = "Deriva de viento menor. Sin interferencia crítica de siembra.";
    } else if (scoreValue >= 60) {
      recommendation = "Recomendación favorable para proceder ajustando de manera moderada la profundidad. La humedad de fondo compensará el sol diurno.";
      danger = "Deriva leve por humedad moderada superficial.";
    } else if (scoreValue >= 41) {
      recommendation = "Siembra en estado condicionado. Ajustar profundidad a nivel húmedo del perfil e incrementar dosificación de base.";
      danger = params.soil_moisture_pct < 15 ? "Deficiencia de humedad superficial inicial." : "Temperatura fluctuante cerca de la banda letárgica.";
    } else {
      recommendation = "NO RECOMENDABLE: Suspender de inmediato los trenes de siembra. El lote carece de las condiciones térmicas o hídricas para viabilidad biológica.";
      danger = params.soil_temp_c < (params.crop === "soy" ? 12 : 10) 
        ? "Baja temperatura de germinación inhibe respiración celular." 
        : "Nivel desértico en horizonte germinativo superficial.";
    }

    return { recommendation, danger };
  };

  const dynamicAdvisory = getDynamicAdvisory();

  // 8. Atributos dinámicos del "EVALUADOR RÁPIDO" (Prioridad 2)
  const getQuickRecommendation = () => {
    let seedingAnswer = "POSTPONED";
    let seedingText = "POSTERGAR OPERACIÓN DE SIEMBRA";
    let windowText = "Pendiente de monitoreo térmico/hídrico";
    let riskText = "Humedad crítica superficial inferior al 15%";

    if (scoreValue >= 81) {
      seedingAnswer = "APPROVED";
      seedingText = "✓ RECOMENDACIÓN TÉCNICA: PROCEDER SIEMBRA INMEDIATA";
      windowText = "Excelente ventana de 24 a 48 horas";
      riskText = "Ninguno detectado. Condiciones ideales de biomasa.";
    } else if (scoreValue >= 41) {
      seedingAnswer = "VIGILANT";
      seedingText = "⚠️ SIEMBRA CONDICIONADA CON AJUSTES DE PROFUNDIDAD";
      windowText = "Ventana ajustada estimada (24 a 72 horas)";

      if (params.soil_type === "sandy" && params.forecast_precip_24h_mm > 30) {
        riskText = "Lixiviación de Nitrógeno y Potasio inmediata por lluvia fuerte";
      } else if (params.soil_moisture_pct < 15) {
        riskText = "Emergencia irregular debido a humedad de perfil del suelo (<15%)";
      } else if (params.soil_temp_c < (params.crop === "soy" ? 12 : 10)) {
        riskText = "Letargo biológico por temperatura de germinación marginal";
      } else {
        riskText = "Precipitación moderadamente fuerte esperada en 24 horas";
      }
    } else {
      // score < 40
      if (params.soil_temp_c < (params.crop === "soy" ? 12 : 10)) {
        riskText = `Temperatura crítica fría (${params.soil_temp_c}°C) detiene la germinación`;
      } else {
        riskText = "Aridez de perfil severa que asfixiará la germinación";
      }
    }

    return { seedingAnswer, seedingText, windowText, riskText };
  };

  const quickRec = getQuickRecommendation();

  // 9. Lógica de "CAMPAIGN INTELLIGENCE" (Prioridad 4)
  const getHistoricalCampaigns = () => {
    const rindeProyectado = Math.round(7500 + scoreValue * 28);
    const rindeAnterior25 = 8900;
    const rindeAnterior24 = 8200;

    const isImproving = rindeProyectado >= rindeAnterior25;

    return {
      rindeProyectado,
      rindeAnterior25,
      rindeAnterior24,
      isImproving,
    };
  };

  const historical = getHistoricalCampaigns();

  // SVG Gauge calculations
  const gaugeRadius = 60;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeProgressOffset = gaugeCircumference - (scoreValue / 100) * gaugeCircumference;

  return (
    <div className="min-h-screen bg-[#07090b] text-[#cbd5e1] font-sans flex flex-col antialiased">
      {/* HEADER MILITARIZADO DE ALTA GESTIÓN */}
      <header className="border-b border-[#1e293b]/40 bg-[#0a0c0e] sticky top-0 z-50 px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4">
        {/* Logo de SmartSeed */}
        <div className="flex items-center gap-3">
          <div className="p-1 px-2.5 rounded bg-[#13161c] border border-slate-800 text-[#00FF66] font-mono text-lg font-black tracking-tight flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,255,102,0.1)]">
            <Sprout className="w-5 h-5 text-[#00FF66]" />
            <span className="text-slate-100 uppercase">Smart</span>
            <span className="text-[#00FF66] uppercase">Seed AI</span>
          </div>
          <div className="h-6 w-[1px] bg-[#1e293b] hidden sm:block"></div>
          <div className="hidden sm:flex flex-col">
            <div className="text-[9px] font-mono text-slate-500 tracking-wider font-bold uppercase">
              Copiloto de Precisión 4.0 // Crucianelli Integration
            </div>
            <div className="text-[10px] font-mono text-[#00ff66] font-black tracking-widest uppercase">
              ACTIVE SUITE LOCK: SYSTEM OK
            </div>
          </div>
        </div>

        {/* Estatus e Identificación */}
        <div className="flex items-center gap-4 text-[11px] font-mono">
          <div className="hidden lg:flex items-center gap-2 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#00ff66] animate-pulse"></span>
            <span>TELEMETRÍA SATÉLITE OPERACIONAL</span>
          </div>
          <div className="h-4 w-[1px] bg-slate-800 hidden lg:block"></div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>PORT 3000 ENGINE // LIVE</span>
          </div>
        </div>
      </header>

      {/* COMPONENTES DE GRID PRINCIAPAL */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* PANEL IZQUIERDO: CALIBRACIÓN FÍSICA DEL LOTE (Siempre visible en lg:col-span-4) */}
        <section id="panel-inputs" className="lg:col-span-4 flex flex-col gap-4">
          <div className="border border-slate-800 bg-[#0a0c0f] p-4 relative flex flex-col gap-4 shadow-xl">
            {/* Esquinas HUD AgTech */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#ff9900]"></div>
            <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[#ff9900]"></div>
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-1">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#ff9900]" />
                <h2 className="text-[11px] font-bold tracking-widest text-[#ff9900] uppercase font-mono">
                  PARÁMETROS FÍSICOS DE LOTE
                </h2>
              </div>
              <span className="text-[9px] font-mono text-slate-500">CONTROL CENTER</span>
            </div>

            {/* 1. SELECCIÓN DE CULTIVO */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                1. Selección del Cultivo:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="btn-crop-corn"
                  onClick={() => setParams({ ...params, crop: "corn" })}
                  className={`py-2 px-3 border font-mono text-[11px] font-bold tracking-tight text-left flex items-center justify-between transition-all cursor-pointer ${
                    params.crop === "corn"
                      ? "border-[#00FF66] bg-[#00FF66]/10 text-[#00FF66]"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <span className="flex items-center gap-1.5">🌽 Maíz Híbrido</span>
                  {params.crop === "corn" && <span className="text-[8px] bg-[#00ff66]/10 px-1 py-0.2">UMBRAL &gt;10°C</span>}
                </button>
                <button
                  id="btn-crop-soy"
                  onClick={() => setParams({ ...params, crop: "soy" })}
                  className={`py-2 px-3 border font-mono text-[11px] font-bold tracking-tight text-left flex items-center justify-between transition-all cursor-pointer ${
                    params.crop === "soy"
                      ? "border-[#00FF66] bg-[#00FF66]/10 text-[#00FF66]"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <span className="flex items-center gap-1.5">🌱 Soja Variedad</span>
                  {params.crop === "soy" && <span className="text-[8px] bg-[#00ff66]/10 px-1 py-0.2">UMBRAL &gt;12°C</span>}
                </button>
              </div>
            </div>

            {/* 2. TEXTURA DEL SUELO */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                2. Textura del Horizonte A:
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "sandy", label: "🏜️ Arenoso", desc: "Gran Porosidad" },
                  { id: "loamy", label: "🪵 Franco", desc: "Balance Hídrico" },
                  { id: "clayey", label: "🧱 Arcilloso", desc: "Fácil Encostr." },
                ].map((soil) => (
                  <button
                    key={soil.id}
                    id={`btn-soil-${soil.id}`}
                    onClick={() => setParams({ ...params, soil_type: soil.id as any })}
                    className={`p-2 border font-mono text-[10px] flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      params.soil_type === soil.id
                        ? "border-[#ff9900] bg-[#ff9900]/10 text-[#ff9900]"
                        : "border-slate-800 bg-slate-900/35 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <span className="font-bold whitespace-nowrap">{soil.label}</span>
                    <span className="text-[7.5px] opacity-75 mt-0.5">{soil.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. SLIDER DE HUMEDAD DE SUELO DE SENSOR */}
            <div className="flex flex-col gap-1.5 bg-[#12151c] p-3 border border-slate-800 rounded">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-300 flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5 text-blue-400" /> HUMEDAD SUELO:
                </span>
                <span className={`font-bold text-xs ${params.soil_moisture_pct < 15 ? "text-red-400 font-black animate-pulse" : "text-[#00FF66]"}`}>
                  {params.soil_moisture_pct}% {params.soil_moisture_pct < 15 ? "MÁXIMO RIESGO" : "Nivel Óptimo"}
                </span>
              </div>
              <input
                id="input-moisture"
                type="range"
                min="5"
                max="50"
                value={params.soil_moisture_pct}
                onChange={(e) => setParams({ ...params, soil_moisture_pct: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#ff9900]"
              />
              <div className="flex justify-between text-[7px] font-mono text-slate-500">
                <span>5% Seco Extremo</span>
                <span className="text-red-400 font-bold">15% Emergencia Crítica</span>
                <span>50% Saturación</span>
              </div>
            </div>

            {/* 4. SLIDER DE TEMPERATURA */}
            <div className="flex flex-col gap-1.5 bg-[#12151c] p-3 border border-slate-800 rounded">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-300 flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5 text-red-500" /> TEMPERATURA SUELO:
                </span>
                <span className="text-xs font-bold text-slate-100">
                  {params.soil_temp_c}°C
                </span>
              </div>
              <input
                id="input-temp"
                type="range"
                min="2"
                max="35"
                value={params.soil_temp_c}
                onChange={(e) => setParams({ ...params, soil_temp_c: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#ff9900]"
              />
              <div className="flex justify-between text-[7px] font-mono text-slate-500">
                <span>2°C Riesgo Congelado</span>
                <span>Maíz &gt;10°C / Soja &gt;12°C</span>
                <span>35°C Estrés Térmico</span>
              </div>
            </div>

            {/* 5. SLIDER DE TELEMETRÍA PRECIPITACIÓN */}
            <div className="flex flex-col gap-1.5 bg-[#12151c] p-3 border border-slate-800 rounded">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-300 flex items-center gap-1">
                  <CloudRain className="w-3.5 h-3.5 text-sky-450" /> PRONÓSTICO DE LLUVIA (24H):
                </span>
                <span className="text-xs font-bold text-slate-150">
                  {params.forecast_precip_24h_mm} mm
                </span>
              </div>
              <input
                id="input-rain"
                type="range"
                min="0"
                max="100"
                value={params.forecast_precip_24h_mm}
                onChange={(e) => setParams({ ...params, forecast_precip_24h_mm: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#ff9900]"
              />
              <div className="flex justify-between text-[7px] font-mono text-slate-500">
                <span>0 mm Lote Seco</span>
                <span>30 mm Límite Lavado</span>
                <span>100 mm Aluvión Hídrico</span>
              </div>
            </div>

            {/* MAPEADOR DE VARIABLES ACTIVO COMPRENSIÓN */}
            <div className="bg-black/50 border border-slate-800 p-3 rounded flex flex-col gap-1.5 text-[9px] font-mono">
              <span className="text-slate-400 font-bold border-b border-slate-800 pb-1 mb-1 text-center block tracking-wider uppercase">
                ALGORÍTMO DE CRUCE DE VARIABLES ACTIVO
              </span>
              <div className="flex justify-between">
                <span>1. Humedad &lt;15% vs Arenoso:</span>
                {params.soil_type === "sandy" && params.soil_moisture_pct < 15 ? (
                  <span className="text-red-400 font-bold uppercase">PROFOUND (+2cm)</span>
                ) : (
                  <span className="text-slate-500 uppercase">Estándar Normal</span>
                )}
              </div>
              <div className="flex justify-between">
                <span>2. Temperatura vs Umbral:</span>
                {params.soil_temp_c < (params.crop === "soy" ? 12 : 10) ? (
                  <span className="text-[#FF0033] font-bold uppercase">POSTPONE SEEDING</span>
                ) : (
                  <span className="text-[#00FF66] font-bold uppercase">TEMPERATURA APART</span>
                )}
              </div>
              <div className="flex justify-between">
                <span>3. Suelo Arenoso vs Lluvia &gt;30mm:</span>
                {params.soil_type === "sandy" && params.forecast_precip_24h_mm > 30 ? (
                  <span className="text-red-400 font-bold uppercase">LIXIVIACIÓN ALERT</span>
                ) : (
                  <span className="text-slate-500 uppercase">Sin Lavado Severo</span>
                )}
              </div>
            </div>
          </div>



          {/* CHAT COPILOT INTEGRATION */}
          <div className="border border-slate-800 bg-[#0a0c0f] p-3 rounded flex flex-col gap-2 h-64 overflow-hidden shadow-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#00ff66]">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>CHATEAR CON SMARTSEED CO-PILOT</span>
              </div>
              <span className="text-[8px] border border-slate-800 px-1 py-0.2 rounded font-mono text-slate-500">
                GEMINI-3.5
              </span>
            </div>

            {/* Chat Log */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[10px]">
              {chatHistory.map((chat, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded max-w-[92%] leading-relaxed ${
                    chat.sender === "user"
                      ? "ml-auto bg-slate-900 text-slate-100 border border-slate-800"
                      : "mr-auto bg-[#10141c] text-[#e2e8f0] border border-[#1e293b]"
                  }`}
                >
                  <div className="text-[8px] text-slate-500 mb-0.5 uppercase font-bold">
                    {chat.sender === "user" ? "Operador" : "SmartSeed AI"}
                  </div>
                  <div className="whitespace-pre-line text-xs">{chat.text}</div>
                </div>
              ))}
              {chatLoading && (
                <div className="mr-auto bg-[#10141c] text-indigo-300 p-2 rounded max-w-[85%] border border-[#1e293b] animate-pulse text-[10px]">
                  <span>Procesando telemetría en satélite...</span>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChatMessage();
              }}
              className="flex gap-1.5"
            >
              <input
                id="input-chat"
                type="text"
                placeholder="Preguntar sobre riesgo de siembra..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-black border border-slate-800 px-2 rounded py-1.5 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#ff9900]"
              />
              <button
                id="btn-chat-send"
                type="submit"
                disabled={chatLoading}
                className="bg-[#ff9900] text-slate-950 px-2.5 flex items-center justify-center transition-all cursor-pointer font-bold rounded"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </section>

        {/* CONTENEDOR CENTRAL/DERECHO: DIAGNÓSTICO Y ANÁLISIS MEJORADO - 8 cols */}
        <section id="panel-diagnostics" className="lg:col-span-8 flex flex-col gap-6">
          
          {loading ? (
            <div className="h-96 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-10 h-10 text-[#ff9900] animate-spin" />
              <span className="font-mono text-xs tracking-widest text-[#ff9900] animate-pulse">
                SCRIPTOR INTEL: REPROCESANDO LOTE EN TIEMPO REAL...
              </span>
            </div>
          ) : (
            <>
              {/* ====================================================================
                  1. SMARTSEED STATUS CENTER (MEJORA 1)
                  ==================================================================== */}
              <div className="border border-slate-800 bg-[#0c0f13] p-5 rounded relative shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                {/* HUD Industrial Corner Accents */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#00ff66]"></div>
                <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[#00ff66]"></div>
                
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#00ff66] animate-pulse"></span>
                    <h3 className="text-xs font-black tracking-widest text-[#00ff66] font-mono uppercase">
                      SMARTSEED STATUS CENTER // CONTROL DE LOTE EN TIEMPO REAL
                    </h3>
                  </div>
                  <span className="text-[8px] font-mono text-slate-500">SYS_ID: CRU_INTEL_EYE_v5</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  {/* Dominant ISI display (3 seconds reading) */}
                  <div className="md:col-span-4 bg-[#11141c] border border-slate-800/85 p-4 rounded flex flex-col items-center justify-center text-center relative overflow-hidden group">
                    <span className="text-[8px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
                      ÍNDICE DE SIEMBRA
                    </span>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className={`text-5xl font-black font-mono tracking-tighter ${uiTheme.text} drop-shadow-[0_0_12px_rgba(${uiTheme.rgb},0.15)]`}>
                        {scoreValue}
                      </span>
                      <span className="text-slate-500 font-bold text-sm">/100</span>
                    </div>
                    <div className={`mt-2.5 px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded border ${uiTheme.border} ${uiTheme.bg} ${uiTheme.text}`}>
                      ESTADO: {uiTheme.classText}
                    </div>
                  </div>

                  {/* Operational context cards */}
                  <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="bg-[#11141c]/80 border border-slate-800/60 p-3 rounded">
                      <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block mb-1">
                        ⚠️ RIESGO PRINCIPAL DE INFRAESTRUCTURA:
                      </span>
                      <p className="text-xs font-mono font-bold text-red-400">
                        {quickRec.riskText}
                      </p>
                    </div>

                    <div className="bg-[#11141c]/80 border border-slate-800/60 p-3 rounded">
                      <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block mb-1">
                        📅 VENTANA ÓPTIMA DE IMPLANTACIÓN:
                      </span>
                      <p className="text-xs font-mono font-bold text-[#00ff66]">
                        {quickRec.windowText}
                      </p>
                    </div>

                    <div className="sm:col-span-2 bg-[#121620] border border-slate-800/80 p-2.5 rounded-sm">
                      <span className="text-[8.5px] font-mono text-slate-400 uppercase tracking-wider block mb-0.5">
                        📝 RESUMEN EJECUTIVO AGRONÓMICO:
                      </span>
                      <p className="text-[11px] text-slate-350 italic leading-relaxed">
                        "{analysis?.commentary.executiveSummary || "Analizando variables de telemetría de campo..."}"
                      </p>
                    </div>
                  </div>
                </div>
              </div>


              {/* ====================================================================
                  2. RECOMENDACIÓN INMEDIATA PREMIUM (MEJORA 2)
                  ==================================================================== */}
              <div className="border border-slate-800 bg-[#080a0e] p-5 relative shadow-lg">
                <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[#ff9900]"></div>
                
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5 mb-4">
                  <Shield className="w-4 h-4 text-[#ff9900]" />
                  <span className="text-xs font-black tracking-widest text-[#e2e8f0] font-mono uppercase">
                    RECOMENDACIÓN RÁPIDA (IMMEDIATE PRE-FLIGHT DIRECTIVE)
                  </span>
                </div>

                <div className="bg-[#121620] border border-slate-800 p-4 rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest block mb-1">
                      DIRECTIVA DE SIEMBRA:
                    </span>
                    <h4 className={`text-sm font-black font-mono tracking-tight ${
                      scoreValue >= 81 ? "text-[#00FF66]" : scoreValue >= 41 ? "text-amber-400" : "text-red-500"
                    }`}>
                      {scoreValue >= 81 
                        ? "✅ PROCEDER CON LA IMPLANTACIÓN INMEDIATA" 
                        : scoreValue >= 41 
                        ? "⚠️ SIEMBRA CONDICIONADA (REQUIERE AJUSTE OPERATIVO)" 
                        : "❌ SUSPENDER OPERACIONES EN LOTE"
                      }
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {dynamicAdvisory.recommendation}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-3.5 font-mono text-xs">
                  <div className="bg-[#101319] border border-slate-800/60 p-3 rounded">
                    <span className="text-[8px] text-slate-500 uppercase block mb-1">VENTANA ÓPTIMA:</span>
                    <strong className="text-slate-200 block text-[11px]">{quickRec.windowText}</strong>
                  </div>

                  <div className="bg-[#101319] border border-slate-800/60 p-3 rounded">
                    <span className="text-[8px] text-slate-500 uppercase block mb-1">RIESGO PRINCIPAL:</span>
                    <strong className="text-red-400 block text-[11px]">{quickRec.riskText}</strong>
                  </div>

                  <div className="bg-[#101319] border border-slate-800/60 p-3 rounded flex flex-col justify-between">
                    <div>
                      <span className="text-[8px] text-slate-500 uppercase block mb-1">NIVEL DE OPORTUNIDAD:</span>
                      <strong className={`text-[11px] font-black uppercase tracking-widest ${
                        scoreValue >= 81 ? "text-[#00FF66]" : scoreValue >= 41 ? "text-amber-400" : "text-red-500"
                      }`}>
                        {scoreValue >= 81 ? "★ ALTO" : scoreValue >= 41 ? "✦ MODERADO" : "⚠ BAJO"}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>


              {/* ====================================================================
                  3. ALERTAS INTELIGENTES (MEJORA 4 - TARJETAS VISUALES)
                  ==================================================================== */}
              <div className="border border-slate-800 bg-[#0d0f14]/50 p-5 rounded relative">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5 mb-4">
                  <AlertTriangle className="w-4 h-4 text-[#ff9900]" />
                  <span className="text-xs font-black tracking-widest text-slate-300 font-mono uppercase">
                    ALERTAS INTELIGENTES ACTIVAS // DETECCIONES DE SENSORES
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3.5">
                  {smartAlerts.map((alert, idx) => {
                    let borderClass = "border-l-[#00FF66] bg-[#00FF66]/5 border-[#00FF66]/20 text-slate-200";
                    let badgeClass = "bg-[#00FF66]/10 text-[#00FF66] border-[#00FF66]/30";
                    let prefixIcon = "🟢";
                    let categoryLabel = "OPPORTUNITY";

                    if (alert.type === "CRITICAL") {
                      borderClass = "border-l-[#FF0033] bg-[#FF0033]/5 border-[#FF0033]/20 text-slate-200";
                      badgeClass = "bg-[#FF0033]/15 text-[#FF0033] border-[#FF0033]/30";
                      prefixIcon = "🔴";
                      categoryLabel = "CRÍTICA";
                    } else if (alert.type === "WARNING") {
                      borderClass = "border-l-[#FF9900] bg-[#FF9900]/5 border-[#FF9900]/20 text-slate-200";
                      badgeClass = "bg-[#FF9900]/15 text-[#FF9900] border-[#FF9900]/30";
                      prefixIcon = "🟠";
                      categoryLabel = "ATENCIÓN";
                    } else {
                      categoryLabel = "OPORTUNIDAD";
                    }

                    return (
                      <div
                        key={idx}
                        id={`alert-card-${idx}`}
                        className={`border-l-4 p-4 rounded-r font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${borderClass}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-sm shrink-0">{prefixIcon}</span>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block uppercase mb-0.5">{categoryLabel}</span>
                            <span className="leading-relaxed text-[11px]">{alert.desc}</span>
                          </div>
                        </div>
                        <span className={`text-[8.5px] font-mono font-black tracking-wider py-1 px-2.5 rounded border uppercase whitespace-nowrap self-start sm:self-center ${badgeClass}`}>
                          {alert.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>


              {/* ====================================================================
                  4. AI REASONING (MEJORA 3 - SECCIÓN PERMANENTE)
                  ==================================================================== */}
              <div className="border border-slate-800 bg-[#0a0c10] p-5 rounded relative">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-4">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-[#00ff66]" />
                    <span className="text-xs font-black tracking-widest text-slate-200 font-mono uppercase">
                      AI REASONING // MOTIVACIONES & CRUCE DETERMINANTE DE VARIABLES
                    </span>
                  </div>
                  <span className="text-[8px] bg-[#00ff66]/10 border border-[#00ff66]/30 px-2 py-0.5 rounded font-mono text-[#00ff66]">
                    RESOLVER v5.24_PRO
                  </span>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest block mb-2">
                    FACTORES DETERMINANTES DETALLADOS:
                  </span>
                  
                  {/* Factor 1: Humedad */}
                  <div className="flex flex-col sm:flex-row justify-between items-start bg-[#11141c] border border-slate-850 p-3 rounded gap-2">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="bg-slate-900 text-slate-400 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] border border-slate-800">
                        1
                      </span>
                      <strong className="text-slate-350">Humedad ({params.soil_moisture_pct}%):</strong>
                    </div>
                    <div className="text-left sm:text-right text-[11px] leading-normal text-slate-300 sm:max-w-xl">
                      Impacto: <span className={params.soil_moisture_pct < 15 ? "text-red-400 font-bold" : "text-slate-300"}>
                        {params.soil_moisture_pct < 15 
                          ? "Incrementa significativamente el riesgo de emergencia irregular por desecación superficial." 
                          : "Humedad idónea para asegurar un inicio homogéneo de germinación biológica."}
                      </span>
                    </div>
                  </div>

                  {/* Factor 2: Temperatura */}
                  <div className="flex flex-col sm:flex-row justify-between items-start bg-[#11141c] border border-slate-850 p-3 rounded gap-2">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="bg-slate-900 text-slate-400 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] border border-slate-800">
                        2
                      </span>
                      <strong className="text-slate-350">Temperatura ({params.soil_temp_c}°C):</strong>
                    </div>
                    <div className="text-left sm:text-right text-[11px] leading-normal text-slate-300 sm:max-w-xl">
                      Impacto: <span className={params.soil_temp_c < (params.crop === "soy" ? 12 : 10) ? "text-red-400 font-bold" : "text-slate-300"}>
                        {params.soil_temp_c < (params.crop === "soy" ? 12 : 10) 
                          ? "Temperatura por debajo del umbral biótico activo; induce letargo e incrementa susceptibilidad fúngica." 
                          : `Nivel térmico adecuado para activar de forma expedita el embrión de ${params.crop === "corn" ? "Maíz" : "Soja"}.`}
                      </span>
                    </div>
                  </div>

                  {/* Factor 3: Suelo */}
                  <div className="flex flex-col sm:flex-row justify-between items-start bg-[#11141c] border border-slate-850 p-3 rounded gap-2">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="bg-slate-900 text-slate-400 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] border border-slate-800">
                        3
                      </span>
                      <strong className="text-slate-350">Tipo de Suelo ({params.soil_type === "sandy" ? "Arenoso" : params.soil_type === "clayey" ? "Arcilloso" : "Franco"}):</strong>
                    </div>
                    <div className="text-left sm:text-right text-[11px] leading-normal text-slate-300 sm:max-w-xl">
                      Impacto: <span>
                        {params.soil_type === "sandy" 
                          ? "Baja retención de humedad y propensión a la lixiviación veloz de nitrógeno de base." 
                          : params.soil_type === "clayey" 
                          ? "Alta retención de agua pero propenso a encostramiento y anoxia radicular ante lluvias intensas." 
                          : "Excelente matriz franco, propicia buena aireación capilar y equilibrio hídrico."}
                      </span>
                    </div>
                  </div>

                  {/* Factor 4: Lluvia prevista */}
                  <div className="flex flex-col sm:flex-row justify-between items-start bg-[#11141c] border border-slate-850 p-3 rounded gap-2">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="bg-slate-900 text-slate-400 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] border border-slate-800">
                        4
                      </span>
                      <strong className="text-slate-350">Lluvia prevista ({params.forecast_precip_24h_mm} mm):</strong>
                    </div>
                    <div className="text-left sm:text-right text-[11px] leading-normal text-slate-300 sm:max-w-xl">
                      Impacto: <span className={params.forecast_precip_24h_mm > 35 ? "text-red-400 font-bold" : "text-slate-300"}>
                        {params.forecast_precip_24h_mm > 35 
                          ? "Exceso pluvial proyectado; alto peligro de lavado de abono y formación de costra superficial." 
                          : params.forecast_precip_24h_mm >= 5 
                          ? "Aporte húmedo favorable que disolverá el fertilizante granulado y potenciará la germinación." 
                          : "Sin lluvias previstas a corto plazo; la siembra dependerá enteramente de las reservas del lote."}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 p-3.5 bg-slate-950/80 border border-slate-800 rounded">
                    <span className="text-[9px] text-slate-500 uppercase block mb-1">RAZONAMIENTO ESTRATÉGICO SISTÉMICO:</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed italic">
                      "El análisis cognitivo de Crucianelli Eye cruza las variables texturales y climáticas para calcular el ISI. El riego principal y la dosis se adaptan para mitigar riesgos puntuales."
                    </p>
                    
                    {/* Model Confidence with visualization */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[10px]">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 uppercase font-bold">Confianza del Modelo AI:</span>
                        <strong className="text-[#00FF66] font-mono">{analysis?.metrics.confidence_level_pct ?? 94}%</strong>
                      </div>
                      <div className="w-full sm:w-48 bg-slate-900 border border-slate-800 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-[#00FF66] h-full rounded-full transition-all duration-700"
                          style={{ width: `${analysis?.metrics.confidence_level_pct ?? 94}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>


              {/* ====================================================================
                  5. PRESCRIPCIONES AGRONÓMICAS (PRIORIDAD 6)
                  ==================================================================== */}
              <div className="border border-slate-800 bg-[#090b0e] p-5 rounded-none relative">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#00FF66]" />
                    <span className="text-xs font-black tracking-widest text-[#00FF66] font-mono uppercase">
                      PRESCRIPCIONES DETALLADAS DE IMPLANTACIÓN
                    </span>
                  </div>
                  <span className="text-[8px] bg-emerald-950/40 border border-emerald-900/50 px-1.5 py-0.2 rounded font-mono text-[#00FF66] uppercase">
                    SYSTEM APPLIED OK
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Profundidad de Seeding */}
                  <div className="bg-[#12151e] p-3.5 border border-slate-800 rounded">
                    <div className="flex items-center gap-1.5 text-xs text-[#00FF66] font-bold tracking-wider font-mono mb-2">
                      <Target className="w-4 h-4" />
                      <span>PROFUNDIDAD SEMILLA</span>
                    </div>
                    <div className="text-xl font-mono font-black text-white">
                      [{analysis?.metrics.prescriptions.seeding_depth_cm ?? "3.0"} cm]
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed font-mono">
                      {analysis?.commentary.justificationDepth || "Se ajusta la profundidad para encontrar la zona de humedad estable e idónea en base a textura."}
                    </p>
                  </div>

                  {/* Densidad de Seeds/ha */}
                  <div className="bg-[#12151e] p-3.5 border border-slate-800 rounded">
                    <div className="flex items-center gap-1.5 text-xs text-[#00FF66] font-bold tracking-wider font-mono mb-2">
                      <Cpu className="w-4 h-4" />
                      <span>DENSIDAD RECOMENDADA</span>
                    </div>
                    <div className="text-xl font-mono font-black text-white">
                      [{analysis?.metrics.prescriptions.density_seeds_ha.toLocaleString() ?? "72,500"} sem/ha]
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed font-mono">
                      {analysis?.commentary.justificationDensity || "Aumentada levemente para amortiguar pérdidas mecánicas por perfil hídrico de inicio."}
                    </p>
                  </div>

                  {/* Dosificación e Nutrientes */}
                  <div className="bg-[#12151e] p-3.5 border border-slate-800 rounded">
                    <div className="flex items-center gap-1.5 text-xs text-[#00FF66] font-bold tracking-wider font-mono mb-2">
                      <CloudRain className="w-4 h-4" />
                      <span>FÓRMULA NPK NUTRIENTES</span>
                    </div>
                    <div className="font-mono text-white leading-snug">
                      {analysis?.metrics.prescriptions.fertilizer_dose_kg_ha ? (
                        <>
                          <span className="text-xl font-black text-white block">
                            [{analysis.metrics.prescriptions.fertilizer_dose_kg_ha} kg/ha]
                          </span>
                          <span className="text-[9.5px] text-[#ff9900] font-bold uppercase block mt-1 tracking-wide truncate">
                            {analysis.metrics.prescriptions.fertilizer_type}
                          </span>
                        </>
                      ) : (
                        <span className="text-lg font-black text-[#ff9900]">
                          [{analysis?.metrics.prescriptions.fertilization_strategy ?? "BALANCED"}]
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed font-mono">
                      {analysis?.commentary.justificationFertilizer || "Estrategia climática hídrica recomendada para el lote."}
                    </p>
                  </div>

                  {/* Prescripción de Nutrientes Puros Profesional */}
                  {analysis?.metrics.prescriptions.professional_fertilizer && (
                    <div className="col-span-1 md:col-span-3 mt-4 bg-[#0a0d14] border border-slate-800 p-4 rounded relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-[#00FF66]/10 text-[#00FF66] text-[8px] font-mono uppercase px-2 py-0.5 border-b border-l border-slate-800 rounded-bl">
                        Prescripción Nutricional de Precisión
                      </div>
                      
                      <h4 className="text-xs font-mono font-bold tracking-wider text-slate-200 mb-3 uppercase flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00FF66] animate-pulse"></span>
                        Recomendación Profesional de Nutrientes Puros
                      </h4>

                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                        {/* 1. Recomendación Principal */}
                        <div className="bg-[#12151e]/80 p-3 border border-slate-800/80 rounded">
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-1.5 text-[#00FF66]">
                            RECOMENDACIÓN PRINCIPAL
                          </div>
                          <div className="text-[11px] font-mono text-slate-300 leading-relaxed">
                            <span className="text-white font-bold block mb-1">
                              Nutrientes: {analysis.metrics.prescriptions.professional_fertilizer.recomendacion_principal.nutrientes}
                            </span>
                            <div className="space-y-0.5 border-t border-slate-800/60 pt-1 mt-1 text-[10px] text-slate-400">
                              {analysis.metrics.prescriptions.professional_fertilizer.recomendacion_principal.dosis_poblada.split('\n').map((line, i) => (
                                <div key={i}>{line}</div>
                              ))}
                            </div>
                            <span className="text-[9px] text-[#ff9900] font-bold block mt-2 font-mono uppercase">
                              Unidades: {analysis.metrics.prescriptions.professional_fertilizer.recomendacion_principal.unidades}
                            </span>
                          </div>
                        </div>

                        {/* 2. Fuente Sugerida */}
                        <div className="bg-[#12151e]/80 p-3 border border-slate-800/80 rounded">
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-1.5 text-[#ff9900]">
                            FUENTE SUGERIDA
                          </div>
                          <div className="text-[11px] font-mono text-slate-300 leading-relaxed">
                            <span className="text-white font-bold block mb-1">
                              Fórmula sugerida:
                            </span>
                            <div className="text-slate-400 text-[10px] leading-relaxed">
                              {analysis.metrics.prescriptions.professional_fertilizer.fuente_sugerida.fertilizante}
                            </div>
                            <div className="mt-2 pt-1 border-t border-slate-800/60">
                              <span className="text-[9px] text-slate-500 block uppercase font-bold">Equivalencia comercial:</span>
                              <span className="text-[10px] text-[#00FF66] font-bold block mt-0.5">
                                {analysis.metrics.prescriptions.professional_fertilizer.fuente_sugerida.equivalencia_comercial}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 3. Rango Operativo */}
                        <div className="bg-[#12151e]/80 p-3 border border-slate-800/80 rounded">
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-1.5 text-[#00FF66]">
                            RANGO OPERATIVO (MIN - MAX)
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 space-y-2">
                            <div>
                              <span className="text-white font-bold text-[9px] block uppercase text-slate-500">Mínimo sugerido:</span>
                              {analysis.metrics.prescriptions.professional_fertilizer.rango_operativo.dosis_minima.split('\n').map((line, i) => (
                                <div key={i} className="text-[10px]">{line}</div>
                              ))}
                            </div>
                            <div className="border-t border-slate-800/60 pt-1">
                              <span className="text-white font-bold text-[9px] block uppercase text-slate-500">Máximo sugerido:</span>
                              {analysis.metrics.prescriptions.professional_fertilizer.rango_operativo.dosis_maxima.split('\n').map((line, i) => (
                                <div key={i} className="text-[10px]">{line}</div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* 4. Impacto Esperado */}
                        <div className="bg-[#12151e]/80 p-3 border border-slate-800/80 rounded">
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-1.5 text-blue-400">
                            IMPACTO ESPERADO
                          </div>
                          <div className="text-[11px] font-mono text-slate-300 leading-relaxed">
                            <span className="text-slate-500 text-[9px] block uppercase font-bold">Rendimiento estimado:</span>
                            <span className="text-white text-sm font-black block text-[#00FF66] mt-0.5">
                              {analysis.metrics.professional_fertilizer?.impacto_esperado.rendimiento_estimado || analysis.metrics.prescriptions.professional_fertilizer.impacto_esperado.rendimiento_estimado}
                            </span>
                            <div className="mt-2 pt-1 border-t border-slate-800/60">
                              <span className="text-slate-500 text-[9px] block uppercase font-bold">Riesgo agronómico:</span>
                              <p className="text-[10px] text-red-400 leading-tight mt-1">
                                {analysis.metrics.prescriptions.professional_fertilizer.impacto_esperado.riesgo_asociado}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>


              {/* ====================================================================
                  6. MAPA INTELIGENTE DEL LOTE (PRIORIDAD 6)
                  ==================================================================== */}
              <div className="border border-slate-800 bg-slate-950/80 p-5 rounded-none relative">
                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#00ff66]"></div>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-2 mb-4 gap-2">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#00ff66]" />
                    <span className="text-xs font-black tracking-widest text-[#e2e8f0] font-mono uppercase">
                      FIELD INTELLIGENCE MAP (SECTORIZADO POR TELEMETRÍA)
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">
                    SECTOR SELECCIONADO GRÁFICO: LOTE-NORTH
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  {/* Cuadrícula interactiva 6x6 */}
                  <div className="md:col-span-7 flex flex-col items-center">
                    <div className="grid grid-cols-6 gap-2 w-full max-w-[280px]">
                      {Array.from({ length: 36 }).map((_, idx) => {
                        const cellData = getSectorTelemetry(idx);
                        const isSelected = selectedSector === idx;

                        let colorStyle = "bg-red-950/40 border-red-800 text-red-400";
                        if (cellData.colorType === "green") {
                          colorStyle = "bg-[#00FF66]/10 border-[#00FF66]/30 text-[#00FF66]";
                        } else if (cellData.colorType === "amber") {
                          colorStyle = "bg-[#FF9900]/10 border-[#FF9900]/30 text-[#FF9900]";
                        }

                        return (
                          <button
                            key={idx}
                            id={`btn-sector-${idx}`}
                            onClick={() => setSelectedSector(idx)}
                            className={`aspect-square border rounded font-mono text-[9px] font-black tracking-tight flex flex-col items-center justify-center transition-all cursor-pointer ${colorStyle} ${
                              isSelected
                                ? "ring-2 ring-white scale-110 shadow-lg border-opacity-100 z-10"
                                : "hover:border-slate-500 hover:scale-105"
                            }`}
                          >
                            <span className="text-[7px] mb-0.5 opacity-80">
                              {["A", "B", "C", "D", "E", "F"][Math.floor(idx / 6)]}
                              {(idx % 6) + 1}
                            </span>
                            <span className="text-[9px]">
                              {cellData.isi}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-[9px] font-mono justify-center">
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#00FF66]/20 border border-[#00FF66] block rounded-sm"></span><span>Óptimo (&gt;80)</span></div>
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#FF9900]/20 border border-[#FF9900] block rounded-sm"></span><span>Intermedio (41-80)</span></div>
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#FF0033]/20 border border-[#FF0033] block rounded-sm"></span><span>Crítico (&lt;40)</span></div>
                    </div>
                  </div>

                  {/* Panel analítico del Sector Seleccionado */}
                  <div className="md:col-span-5 bg-[#0f121a]/95 border border-slate-800 p-4 rounded-none font-mono text-[10px] space-y-3 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                    <div className="border-b border-slate-800 pb-1.5 text-[#00ff66] font-bold text-[11px] uppercase flex justify-between">
                      <span>{selectedSectorData.name}</span>
                      <span className="text-slate-500">ACTIVE PIN</span>
                    </div>

                    <div className="space-y-2 text-slate-300">
                      <div className="flex justify-between items-center bg-black/40 p-1.5 rounded">
                        <span>Humedad Estimada:</span>
                        <strong className="text-white text-xs">{selectedSectorData.moisture}%</strong>
                      </div>
                      <div className="flex justify-between items-center bg-black/40 p-1.5 rounded">
                        <span>Temperatura Suelo:</span>
                        <strong className="text-white text-xs">{selectedSectorData.temp}°C</strong>
                      </div>
                      <div className="flex justify-between items-center bg-black/40 p-1.5 rounded">
                        <span>Índice ISI Local:</span>
                        <strong className={`${selectedSectorData.labelColor} text-xs font-black`}>
                          {selectedSectorData.isi}/100
                        </strong>
                      </div>
                      <div className="flex justify-between items-center bg-black/40 p-1.5 rounded">
                        <span>Potencial Productivo:</span>
                        <strong className="text-[#00FF66] text-xs font-black">
                          {selectedSectorData.potential}%
                        </strong>
                      </div>
                    </div>

                    <div className="p-2 border border-slate-800 rounded bg-[#151924]/60 text-[9px] text-[#94a3b8] leading-relaxed">
                      💡 El mapa del lote representa las fluctuaciones de relieve terrestre, drenajes fluviales e insolamento acumulados por satélite.
                    </div>
                  </div>
                </div>
              </div>


              {/* ====================================================================
                  7. PREDICTIVE YIELD CENTER (PRIORIDAD 4 Wow Screen y PRIORIDAD 6)
                  ==================================================================== */}
              {(() => {
                const yieldAnterior = params.crop === "corn" ? 8900 : 3200;
                const yieldProyectado = params.crop === "corn" 
                  ? Math.round(7500 + scoreValue * 28) 
                  : Math.round(2600 + scoreValue * 16);
                const yieldVariationPct = parseFloat(((yieldProyectado - yieldAnterior) / yieldAnterior * 100).toFixed(1));
                const isImproving = yieldVariationPct >= 0;

                return (
                  <div className="border border-slate-800 bg-[#0a0c10] p-5 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[#00FF66]" />
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-2.5 mb-4 gap-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-[#00FF66]" />
                        <span className="text-xs font-black tracking-widest text-slate-100 font-mono uppercase">
                          PREDICTIVE YIELD CENTER // CENTRO PREDICTIVO DE RINDE
                        </span>
                      </div>
                      <span className="text-[8px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded font-mono text-slate-400">
                        AISTUDIO PREDICTIVE ALGORITHM v3.12
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                      
                      {/* Metric highlights */}
                      <div className="md:col-span-5 space-y-3.5">
                        <div className="bg-slate-950/60 p-3.5 border border-slate-805 rounded flex flex-col justify-between">
                          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                            RENDIMIENTO ESTIMADO DEL LOTE
                          </span>
                          <span className="text-3xl font-mono font-black text-[#00FF66] tracking-tight leading-none mt-1 shadow-sm">
                            {yieldProyectado.toLocaleString()} kg/ha
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-950/60 p-3 border border-slate-805 rounded">
                            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">
                              CAMPAÑA ANTERIOR
                            </span>
                            <span className="text-sm font-mono font-bold text-slate-300">
                              {yieldAnterior.toLocaleString()} kg/ha
                            </span>
                          </div>

                          <div className="bg-slate-950/60 p-3 border border-slate-805 rounded flex flex-col justify-between">
                            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                              VARIACIÓN PROYECTADA
                            </span>
                            <span className={`text-sm font-mono font-bold flex items-center gap-1 ${isImproving ? "text-[#00FF66]" : "text-[#FF0033]"}`}>
                              {isImproving ? "↑" : "↓"} {isImproving ? "+" : ""}{yieldVariationPct}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Stunning modern bar chart representation */}
                      <div className="md:col-span-7 bg-[#12151d] border border-slate-800 p-4 rounded font-mono text-xs">
                        <span className="text-[9px] text-slate-500 uppercase block mb-3 font-bold tracking-wider">
                          SIMULACIÓN COMPARATIVA DE RINDE (KG/HA)
                        </span>

                        <div className="space-y-3.5 pt-1">
                          {/* Campaña 2024 */}
                          <div>
                            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                              <span>Campaña Agrónoma 2024</span>
                              <span>8,200 kg/ha</span>
                            </div>
                            <div className="w-full bg-[#1e293b]/30 h-3 rounded-sm overflow-hidden border border-slate-850">
                              <div className="bg-slate-700 h-full w-[70%]" />
                            </div>
                          </div>

                          {/* Campaña 2025 */}
                          <div>
                            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                              <span>Campaña Agrónoma 2025</span>
                              <span>{params.crop === "corn" ? "8,900" : "3,100"} kg/ha</span>
                            </div>
                            <div className="w-full bg-[#1e293b]/30 h-3 rounded-sm overflow-hidden border border-slate-850">
                              <div className="bg-slate-500 h-full w-[82%]" />
                            </div>
                          </div>

                          {/* Campaña 2026 Proyectada */}
                          <div>
                            <div className="flex justify-between text-[10px] text-[#00FF66] font-bold mb-1">
                              <span className="flex items-center gap-1">★ Campaña Activa 2026 (Proyección AI)</span>
                              <span>{yieldProyectado.toLocaleString()} kg/ha</span>
                            </div>
                            <div className="w-full bg-[#1e293b]/40 h-3.5 rounded-sm overflow-hidden border border-[#00FF66]/30 shadow-[0_0_10px_rgba(0,255,102,0.1)]">
                              <div 
                                className="bg-[#00FF66] h-full transition-all duration-1000 ease-out shadow-[0_0_8px_#00FF66]" 
                                style={{ width: `${Math.min(100, Math.max(25, (yieldProyectado / (params.crop === "corn" ? 11000 : 4500)) * 100))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })()}


              {/* ====================================================================
                  8. SMART HISTORY & HISTORIAL DE CAMPAÑAS (MEJORA 5)
                  ==================================================================== */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* SMART HISTORY Module */}
                <div className="border border-slate-800 bg-[#0a0c10] p-4 rounded relative flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[#00FF66]"></div>
                  
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-[#00FF66]" />
                        <span className="text-xs font-black tracking-widest font-mono text-slate-200 uppercase">
                          SMART HISTORY // REGISTROS RECIENTES
                        </span>
                      </div>
                      <span className="text-[8px] bg-[#00FF66]/10 border border-[#00FF66]/25 px-1.5 py-0.5 rounded text-[#00FF66] font-mono">
                        AUTO-GUARDADO ACTIVO
                      </span>
                    </div>

                    {/* Supabase connection panel */}
                    <div className="mb-4 bg-[#0d1117] border border-slate-800 p-3 rounded">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-mono text-[10px]">
                          <span className={`w-2.5 h-2.5 rounded-full ${sbStatus?.connected && sbStatus?.tableExists ? "bg-[#00ff66]" : "bg-red-500 animate-pulse"}`} />
                          <span className="text-slate-300 font-bold uppercase">SUPABASE: {sbStatus?.projectName || "SmartSeed-AI"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setShowConfigForm(!showConfigForm)}
                            className="text-[8.5px] font-mono text-[#00ff66] hover:text-[#00ff66]/80 underline cursor-pointer"
                          >
                            {showConfigForm ? "[Cerrar]" : "[Ajustes]"}
                          </button>
                          <span className={`text-[8.5px] font-mono font-black uppercase px-1.5 py-0.5 rounded ${
                            sbStatus?.connected && sbStatus?.tableExists 
                              ? "bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/20" 
                              : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                          }`}>
                            {sbLoading ? "Conectando..." : sbStatus?.connected && sbStatus?.tableExists ? "ACTIVO" : "REQUERIDO"}
                          </span>
                        </div>
                      </div>

                      {/* Manual/Auto Config Form (Shows if requested or if not configured) */}
                      {(showConfigForm || (sbStatus && !sbStatus.configured)) && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-800">
                          <p className="text-[#00ff66] text-[9.5px] font-mono leading-relaxed mb-2">
                            ⚡ <strong>Conexión Automática a SmartSeed-AI:</strong>
                            <br />
                            Ingrese la URL y la Anon Key de su proyecto de Supabase para configurar el sistema automáticamente al instante.
                          </p>
                          <form onSubmit={handleSaveCredentials} className="space-y-2 font-sans">
                            <div>
                              <label className="block text-[8px] text-slate-400 font-mono uppercase font-bold mb-0.5">Project URL</label>
                              <input 
                                type="text" 
                                placeholder="https://your-project.supabase.co" 
                                value={formUrl}
                                onChange={(e) => setFormUrl(e.target.value)}
                                className="w-full bg-black/50 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#00ff66] font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] text-slate-400 font-mono uppercase font-bold mb-0.5">Anon / Public API Key</label>
                              <input 
                                type="password" 
                                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." 
                                value={formKey}
                                onChange={(e) => setFormKey(e.target.value)}
                                className="w-full bg-black/50 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#00ff66] font-mono"
                              />
                            </div>
                            {saveError && (
                              <p className="text-red-400 text-[9px] font-mono leading-tight">❌ {saveError}</p>
                            )}
                            <button
                              type="submit"
                              disabled={savingCredentials}
                              className="w-full bg-[#00ff66]/15 hover:bg-[#00ff66]/25 border border-[#00ff66]/30 text-[#00ff66] text-[9.5px] font-mono font-bold py-1 px-2 rounded cursor-pointer transition-all duration-150"
                            >
                              {savingCredentials ? "CONECTANDO..." : "CONECTAR AUTOMÁTICAMENTE"}
                            </button>
                          </form>
                        </div>
                      )}

                      {/* Expandable setup details if table is missing or not configured */}
                      {sbStatus && sbStatus.configured && (!sbStatus.connected || !sbStatus.tableExists) && !showConfigForm && (
                        <div className="mt-2 text-[9.5px] font-mono text-slate-400 border-t border-slate-850 pt-2 space-y-2">
                          {!sbStatus.tableExists ? (
                            <div className="space-y-2 bg-yellow-500/5 border border-yellow-500/10 p-2.5 rounded">
                              <p className="text-yellow-400 font-bold flex items-center gap-1 text-[10px]">
                                🔌 Conectado a Supabase, pero falta la tabla.
                              </p>
                              <div className="text-[9px] text-slate-300 space-y-1">
                                <p className="font-bold text-white mb-1">Para solucionarlo automáticamente, siga estos 4 simples pasos:</p>
                                <ol className="list-decimal pl-4 space-y-1">
                                  <li>Vaya a su <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-[#00ff66] underline">consola de Supabase</a>.</li>
                                  <li>Haga clic en la sección <strong className="text-white">"SQL Editor"</strong> (en el menú izquierdo).</li>
                                  <li>Haga clic en <strong className="text-white">"New Query"</strong> (+).</li>
                                  <li>Copie el código SQL de abajo, péguelo allí y haga clic en <strong className="text-[#00ff66]">"Run"</strong> (Ejecutar).</li>
                                </ol>
                              </div>
                              <div className="bg-black/95 p-2 rounded text-[8px] border border-slate-800 overflow-x-auto relative mt-2">
                                <pre className="text-[#a0efb0] font-mono leading-relaxed">{sbStatus.schemaSql}</pre>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(sbStatus.schemaSql);
                                    setCopiedSql(true);
                                    setTimeout(() => setCopiedSql(false), 2000);
                                  }}
                                  className="absolute top-2 right-2 bg-slate-900 hover:bg-[#00ff66]/10 hover:text-[#00ff66] hover:border-[#00ff66]/30 text-[8.5px] px-2 py-0.5 border border-slate-850 rounded text-slate-300 cursor-pointer font-bold transition-all duration-150"
                                >
                                  {copiedSql ? "✓ ¡COPIADO!" : "COPIAR SQL"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-red-400">
                              Error de conexión: {sbStatus.errorMessage || "No se pudo conectar."}
                            </p>
                          )}
                        </div>
                      )}

                      {sbStatus?.connected && sbStatus?.tableExists && !showConfigForm && (
                        <div className="mt-1.5 flex justify-between items-center text-[9px] font-mono text-slate-400 border-t border-slate-850 pt-1.5">
                          <span>Registros en la nube: <strong className="text-white">{sbStatus.recordCount}</strong></span>
                          <span>Persistencia: <strong className="text-[#00ff66]">Durable Cloud</strong></span>
                        </div>
                      )}
                    </div>
                    
                    <p className="text-[9.5px] font-mono text-slate-400 mb-3 leading-relaxed">
                      💡 Las simulaciones de lote se graban automáticamente al ajustar los sensores. 
                      Haga clic en cualquier fila para restaurar instantáneamente esa configuración física de lote.
                    </p>

                    <div className="overflow-y-auto max-h-[190px] pr-1 scrollbar-thin">
                      <table className="w-full font-mono text-[10px] text-slate-350 text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-500 text-[8px] uppercase">
                            <th className="pb-1">Fecha</th>
                            <th className="pb-1">Cultivo</th>
                            <th className="pb-1 text-center">ISI</th>
                            <th className="pb-1 text-right">Resultado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850">
                          {smartHistory.map((item) => (
                            <tr 
                              key={item.id}
                              onClick={() => loadHistoryItem(item)}
                              className="hover:bg-slate-900/80 cursor-pointer transition-all active:scale-[99%]"
                            >
                              <td className="py-2 font-bold text-slate-400">{item.date}</td>
                              <td className="py-2 text-[10.5px]">
                                {item.crop === "corn" ? "🌽 Maíz" : "🌱 Soja"} 
                                <span className="text-[8px] text-slate-500 uppercase ml-1">
                                  ({item.soil_type === "sandy" ? "Arenoso" : item.soil_type === "clayey" ? "Arcilloso" : "Franco"})
                                </span>
                              </td>
                              <td className="py-2 text-center">
                                <span className={`font-black px-1.5 py-0.5 rounded text-[9.5px] ${
                                  item.isi >= 81 ? "bg-[#00FF66]/15 text-[#00FF66]" : item.isi >= 41 ? "bg-amber-400/15 text-amber-400" : "bg-red-500/15 text-red-500"
                                }`}>
                                  {item.isi}
                                </span>
                              </td>
                              <td className="py-2 text-right font-bold text-slate-200">
                                {item.recommendation} →
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* HISTORIAL ANUAL COMPARATIVO */}
                <div className="border border-slate-800 bg-[#0a0c0f] p-4 rounded relative flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[#ff9900]"></div>

                  <div>
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-3">
                      <History className="w-4 h-4 text-[#ff9900]" />
                      <span className="text-xs font-bold tracking-widest font-mono text-[#ff9900] uppercase">
                        CAMPAIGN INTELLIGENCE // HISTORICO ANUAL COMPARATIVO
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full font-mono text-[10px] text-slate-300 text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 text-[8.5px] uppercase">
                            <th className="pb-1.5 font-bold">Campaña Agrónoma</th>
                            <th className="pb-1.5 font-bold text-center">ISI Promedio</th>
                            <th className="pb-1.5 font-bold text-right font-bold">Rendimiento Historial (Kg/ha)</th>
                            <th className="pb-1.5 font-bold text-right">Tendencia Productiva</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          <tr>
                            <td className="py-2.5 text-slate-400">2024 ({params.crop === "corn" ? "Maíz Híbrido" : "Soja Variedad"})</td>
                            <td className="py-2.5 text-center font-bold">68/100</td>
                            <td className="py-2.5 text-right font-black">8,200 kg/ha</td>
                            <td className="py-2.5 text-right text-slate-500">— Base histórica</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-slate-400">2025 ({params.crop === "corn" ? "Maíz Híbrido" : "Soja Variedad"})</td>
                            <td className="py-2.5 text-center font-bold">72/100</td>
                            <td className="py-2.5 text-right font-black">{params.crop === "corn" ? "8,900" : "3,200"} kg/ha</td>
                            <td className="py-2.5 text-right text-[#00FF66] font-bold">↑ +8.5% incremento</td>
                          </tr>
                          <tr className="bg-[#141a22]/50">
                            <td className="py-2.5 text-[#00FF66] font-bold">2026 (Campaña Activa AI)</td>
                            <td className="py-2.5 text-center font-black text-white">
                              [{scoreValue}/100]
                            </td>
                            <td className="py-2.5 text-right font-black text-white">
                              ~{(params.crop === "corn" ? Math.round(7500 + scoreValue * 28) : Math.round(2600 + scoreValue * 16)).toLocaleString()} kg/ha
                            </td>
                            <td className="py-2.5 text-right">
                              {historical.isImproving ? (
                                <span className="text-[#00FF66] font-bold flex items-center justify-end gap-1">
                                  <TrendingUp className="w-3.5 h-3.5" /> Incremento proyectado
                                </span>
                              ) : (
                                <span className="text-amber-500 font-bold flex items-center justify-end gap-1">
                                  <TrendingDown className="w-3.5 h-3.5 animate-pulse" /> Riesgo marginal
                                </span>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                
              </div>


              {/* ====================================================================
                  9. DATOS TÉCNICOS (PRIORIDAD 6)
                  ==================================================================== */}
              <div className="border border-slate-800 bg-[#0c0e12]/95 rounded-none flex flex-col overflow-hidden relative shadow-xl">
                {/* Tabs navigations */}
                <div className="grid grid-cols-2 border-b border-slate-800 bg-[#090b0e] text-[9px] font-mono font-bold tracking-wider uppercase">
                  <button
                    id="tab-section-1"
                    onClick={() => setActiveTab("section1")}
                    className={`py-2.5 px-2 text-center transition-all border-r border-slate-800 cursor-pointer ${
                      activeTab === "section1"
                        ? "bg-[#0c0e12] text-[#00FF66] border-b-2 border-b-[#00FF66]"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    📊 TEXTO VISUAL (PARTE 1)
                  </button>
                  <button
                    id="tab-section-2"
                    onClick={() => setActiveTab("section2")}
                    className={`py-2.5 px-2 text-center transition-all cursor-pointer ${
                      activeTab === "section2"
                        ? "bg-[#0c0e12] text-[#ff9900] border-b-2 border-b-[#ff9900]"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    🗄️ JSON CODESON (PARTE 2)
                  </button>
                </div>

                <div className="p-4 overflow-y-auto">
                  {/* TAB SECCIÓN 1 */}
                  {activeTab === "section1" && analysis && (
                    <div id="content-section-1" className="space-y-4">
                      <button
                        onClick={handleCopySection1}
                        className="w-full bg-slate-900 override-bg-green hover:bg-slate-800 border border-slate-800 py-2 px-3 text-xs font-mono rounded flex items-center justify-center gap-1.5 transition-all text-slate-300 active:scale-[98%] cursor-pointer"
                      >
                        {copiedSection1 ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">¡Copia Exitosa del Reporte!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>COPIAR INFORMACIÓN AGRONÓMICA NATURAL</span>
                          </>
                        )}
                      </button>

                      <div className="bg-slate-950 p-3.5 rounded border border-slate-900 font-mono text-[10px] text-slate-300 whitespace-pre-wrap leading-relaxed select-all">
                        {analysis.section_1}
                      </div>
                    </div>
                  )}

                  {/* TAB SECCIÓN 2 */}
                  {activeTab === "section2" && analysis && (
                    <div id="content-section-2" className="space-y-4">
                      <button
                        onClick={handleCopySection2}
                        className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 py-2 px-3 text-xs font-mono rounded flex items-center justify-center gap-1.5 transition-all text-slate-300 active:scale-[98%] cursor-pointer"
                      >
                        {copiedSection2 ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">¡JSON Copiado al Portapapeles!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>COPIAR PARÁMETROS JSON</span>
                          </>
                        )}
                      </button>

                      <div className="bg-black/95 p-3 rounded border border-slate-900 font-mono text-[9px] text-[#a0efb0] h-64 overflow-auto">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(analysis.section_2, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </>
          )}

        </section>
      </main>

      {/* FOOTER CO-BRAND CRUCIANELLI */}
      <footer className="border-t border-[#1e293b]/40 bg-[#06080a] py-3.5 px-4 md:px-6 text-center text-[10px] font-mono text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-3">
        <span>© 2026 SMARTSEED AI - CO-DESARROLLADO EN ENTORNO CLOUD DE AGRICULTURA DE PRECISIÓN 4.0</span>
        <div className="flex items-center gap-2">
          <span>SISTEMA INCORPORADO DE TELEMETRÍA CRUCIANELLI INTEGRATED EYE</span>
          <span className="w-2 h-2 rounded-full bg-[#00ff66] animate-pulse"></span>
        </div>
      </footer>

      {/* FLOATING ACTION ASSISTANT CO-PILOT (PRIORIDAD 2) */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end font-mono">
        {/* Assistant Drawer Panel */}
        {isAssistantOpen && (
          <div 
            id="assistant-sidebar"
            className="w-[340px] sm:w-[410px] h-[580px] max-h-[85vh] bg-[#090b10] border-2 border-slate-800 rounded-lg shadow-[0_0_35px_rgba(0,255,102,0.15)] flex flex-col overflow-hidden mb-3 animate-in fade-in slide-in-from-bottom-5 duration-200"
          >
            {/* Drawer Header */}
            <div className="bg-[#10141c] border-b border-slate-850 p-3.5 flex justify-between items-center relative">
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#00FF66]" />
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-full bg-[#00FF66]/10 border border-[#00FF66]/20 text-[#00FF66]">
                  <Bot className="w-4 h-4 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-xs font-black tracking-widest text-[#00FF66] uppercase">
                    SMARTSEED CO-PILOT
                  </h3>
                  <p className="text-[8px] text-slate-400">AGRONOMIC AI ASSISTANT // ONLINE</p>
                </div>
              </div>
              <button 
                id="close-assistant-btn"
                onClick={() => setIsAssistantOpen(false)}
                className="p-1 bg-slate-900 border border-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Contextual indicators */}
            <div className="bg-[#12161f] border-b border-slate-850 px-3.5 py-2 flex flex-wrap gap-2 text-[9px] text-slate-400 font-bold border-t border-slate-900">
              <span className="flex items-center gap-0.5 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-900">
                CULTIVO: <strong className="text-white">{params.crop === "corn" ? "🌽 MAÍZ" : "🌱 SOJA"}</strong>
              </span>
              <span className="flex items-center gap-0.5 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-900">
                HUMEDAD: <strong className="text-white">{params.soil_moisture_pct}%</strong>
              </span>
              <span className="flex items-center gap-0.5 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-900">
                TEMPERATURA: <strong className="text-white">{params.soil_temp_c}°C</strong>
              </span>
            </div>

            {/* Suggestions wrapper */}
            <div className="px-3 py-2 border-b border-slate-900 bg-[#07090d]">
              <span className="text-[7.5px] text-slate-500 uppercase font-black block mb-1 tracking-wider">
                CONSULTACIONES RÁPIDAS
              </span>
              <div className="flex flex-col gap-1.5">
                {[
                  {
                    icon: "📊",
                    text: "Generar informe agronómico completo",
                    query: "GENERAR INFORME COMPLETO de precisión para este lote"
                  },
                  {
                    icon: "🌾",
                    text: "¿Cómo influye el suelo arenoso?",
                    query: `Con suelo tipo ${params.soil_type === "sandy" ? "Arenoso" : "Franco/Arcilloso"} y humedad del ${params.soil_moisture_pct}%, ¿cuál es el riesgo exacto de emergencia irregular y qué profundidad de siembra compensa mejor?`
                  },
                  {
                    icon: "🌡️",
                    text: "¿Debo pausar ante bajas temperaturas?",
                    query: `Con temperatura del suelo de ${params.soil_temp_c}°C para cultivo de ${params.crop === "corn" ? "Maíz Híbrido" : "Soja Variedad"}, ¿cuál es el letargo biológico y de cuánto debe ser la prórroga de siembra?`
                  },
                  {
                    icon: "💧",
                    text: "Sugerencia de dosis nitrógeno",
                    query: `Con humedad de ${params.soil_moisture_pct}% y pronóstico de lluvia de ${params.forecast_precip_24h_mm}mm, ¿qué dosis exacta de nitrógeno recomiendas para evitar lavado y lixiviación severa?`
                  }
                ].map((sug, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => handleAssistantSuggestionSubmit(sug.query)}
                    className="w-full text-left bg-[#131720]/80 text-[9.5px] p-2 border border-slate-800 hover:border-[#ff9900]/40 transition-all text-slate-300 hover:text-white flex items-center gap-1.5 rounded cursor-pointer"
                  >
                    <span>{sug.icon}</span>
                    <span className="truncate">{sug.text}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 font-mono text-[10.5px] bg-[#07090b]">
              {chatHistory.map((chat, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded max-w-[88%] leading-relaxed ${
                    chat.sender === "user"
                      ? "ml-auto bg-slate-900 text-slate-100 border border-slate-800"
                      : "mr-auto bg-[#10141c] text-slate-200 border border-slate-850"
                  }`}
                >
                  <div className="text-[7.5px] text-slate-500 mb-1 uppercase font-bold flex items-center gap-1">
                    {chat.sender === "user" ? "🙋 OPERADOR" : "🤖 SMARTSEED CO-PILOT"}
                  </div>
                  <div className="whitespace-pre-line text-[11px] leading-relaxed select-text">
                    {chat.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="mr-auto bg-[#10141c] text-amber-400 p-2.5 rounded max-w-[85%] border border-[#1e293b] animate-pulse text-[10px]">
                  <span>Petición satelital en proceso...</span>
                </div>
              )}
            </div>

            {/* Chat form */}
            <div className="p-3.5 bg-[#0a0c10] border-t border-slate-850">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChatMessage();
                }}
                className="flex gap-2"
              >
                <input
                  id="assistant-sidebar-input"
                  type="text"
                  placeholder="Preguntar al asistente AI de lote..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 bg-black border border-slate-800 px-2.5 py-2 rounded text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-[#00FF66] font-sans"
                />
                <button
                  id="assistant-sidebar-send-btn"
                  type="submit"
                  className="bg-[#00FF66]/10 text-[#00FF66] hover:bg-[#00FF66]/20 border border-[#00FF66]/30 px-3.5 rounded flex items-center justify-center transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Global floating copilot trigger button (MEJORA 8) */}
        <button
          id="global-assistant-trigger"
          onClick={() => setIsAssistantOpen(!isAssistantOpen)}
          className={`flex items-center gap-2 px-4 py-3 rounded-full border-2 transition-all duration-300 shadow-[0_0_25px_rgba(0,0,0,0.6)] cursor-pointer active:scale-95 text-xs font-black tracking-wider uppercase ${
            isAssistantOpen 
              ? "bg-[#FF9900]/10 border-[#FF9900] text-[#FF9900] hover:bg-[#FF9900]/25 shadow-[#FF9900]/20" 
              : "bg-[#0a0c11] border-[#00FF66] text-[#00FF66] hover:bg-[#00FF66]/10 shadow-[#00FF66]/20"
          }`}
        >
          <div className="relative">
            <Bot className="w-4 h-4" />
            <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full animate-ping ${isAssistantOpen ? "bg-[#FF9900]" : "bg-[#00FF66]"}`}></span>
            <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${isAssistantOpen ? "bg-[#FF9900]" : "bg-[#00FF66]"}`}></span>
          </div>
          <span>
            {isAssistantOpen ? "Ocultar Copiloto" : "🤖 Consultar SmartSeed AI"}
          </span>
        </button>
      </div>
    </div>
  );
}

// Pequeño componente helper para Emojis del Clima
function ClockEmoji({ score }: { score: number }) {
  if (score >= 81) return <span className="text-lg">⚡</span>;
  if (score >= 41) return <span className="text-lg">⏳</span>;
  return <span className="text-lg">🛑</span>;
}
