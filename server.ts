import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// Standard ESM replacement for __dirname, safe for CommonJS environment like Vercel
let __filename = "";
let __dirname = "";
try {
  if (typeof import.meta !== "undefined" && import.meta && import.meta.url) {
    __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  }
} catch (e) {
  // Safe catch
}
if (!__filename) {
  __filename = typeof __filename !== "undefined" ? __filename : process.cwd();
  __dirname = typeof __dirname !== "undefined" ? __dirname : process.cwd();
}

const PORT = 3000;

// Validador robusto de URL de Supabase para evitar llamadas erróneas a placeholders o dominios inválidos
function isValidSupabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const trimmed = url.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return false;
    }
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    // Excluir motores de búsqueda conocidos o dominios de marcador de posición
    if (host === "www.google.com" || host === "google.com" || host.includes("example.com")) {
      return false;
    }
    // Debe contener supabase o ser localhost/127.0.0.1
    return host.includes("supabase") || host === "localhost" || host === "127.0.0.1";
  } catch (e) {
    return false;
  }
}

// Lazy initialize Supabase client
let supabaseClient: any = null;
let supabaseUrl = process.env.SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_ANON_KEY;

function getSupabaseClient() {
  supabaseUrl = process.env.SUPABASE_URL;
  supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!isValidSupabaseUrl(supabaseUrl)) {
    return null;
  }

  if (!supabaseClient && supabaseUrl && supabaseKey) {
    try {
      let sanitizedUrl = supabaseUrl.trim();
      if (sanitizedUrl.endsWith("/")) {
        sanitizedUrl = sanitizedUrl.slice(0, -1);
      }
      if (sanitizedUrl.endsWith("/rest/v1")) {
        sanitizedUrl = sanitizedUrl.substring(0, sanitizedUrl.length - 8);
      }
      if (sanitizedUrl.endsWith("/")) {
        sanitizedUrl = sanitizedUrl.slice(0, -1);
      }
      supabaseClient = createClient(sanitizedUrl, supabaseKey);
    } catch (err) {
      console.error("Failed to initialize Supabase client:", err);
    }
  }
  return supabaseClient;
}

// In-memory fallback history
let localHistory = [
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
];

// Lazy initialize Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return aiClient;
}

// Algorítmica Determinista (Fallback Seguro en caso de que falle o falte el API Key)
function runStaticAnalysis(
  crop: "corn" | "soy",
  soil_moisture_pct: number,
  soil_type: "sandy" | "loamy" | "clayey",
  soil_temp_c: number,
  forecast_precip_24h_mm: number
) {
  // 1. Calcular ISI (Smart Seeding Index)
  // Moisture impact (ideal around 20-30%)
  let moistureScore = 100;
  if (soil_moisture_pct < 15) {
    moistureScore = Math.max(20, (soil_moisture_pct / 15) * 80);
  } else if (soil_moisture_pct > 35) {
    moistureScore = Math.max(30, 100 - (soil_moisture_pct - 35) * 4);
  }

  // Temperature impact
  const tempThreshold = crop === "soy" ? 12 : 10;
  let tempScore = 100;
  if (soil_temp_c < tempThreshold) {
    tempScore = Math.max(10, 100 - (tempThreshold - soil_temp_c) * 15);
  } else if (soil_temp_c > 28) {
    tempScore = Math.max(60, 100 - (soil_temp_c - 28) * 3);
  }

  // Rain impact
  let rainScore = 100;
  if (soil_type === "sandy" && forecast_precip_24h_mm > 30) {
    // High leaching risk on sandy soil
    rainScore = 60;
  } else if (forecast_precip_24h_mm > 50) {
    // General flooding/crusting risk
    rainScore = Math.max(40, 100 - (forecast_precip_24h_mm - 50) * 1.5);
  }

  // Combined score
  const isi_score = Math.round(
    moistureScore * 0.4 + tempScore * 0.35 + rainScore * 0.25
  );

  // Classification & Color
  let classification: "OPTIMAL" | "FAVORABLE" | "MODERATE_RISK" | "NOT_RECOMMENDED" = "FAVORABLE";
  let ui_color_code = "#FF9900"; // Amber/Orange

  if (isi_score >= 81) {
    classification = "OPTIMAL";
    ui_color_code = "#00FF66"; // Cyber Green
  } else if (isi_score >= 61) {
    classification = "FAVORABLE"; // with limitations
    ui_color_code = "#FF9900"; // Tech Amber
  } else if (isi_score >= 41) {
    classification = "MODERATE_RISK";
    ui_color_code = "#FF9900"; // Tech Amber
  } else {
    classification = "NOT_RECOMMENDED";
    ui_color_code = "#FF0033"; // Neon Red
  }

  // 2. Prescriptions
  // Seeding depth: Standard: corn = 4.0cm, soy = 3.0cm
  let seeding_depth_cm = crop === "corn" ? 4.0 : 3.0;
  // Rule 1: Sandy + moisture < 15% -> add 1.5 to 2.0 cm
  if (soil_type === "sandy" && soil_moisture_pct < 15) {
    seeding_depth_cm += 2.0;
  } else if (soil_moisture_pct < 15) {
    // General dry soil offset
    seeding_depth_cm += 1.0;
  } else if (soil_moisture_pct > 32) {
    seeding_depth_cm = Math.max(1.5, seeding_depth_cm - 0.8); // shallow if too wet
  }

  // Density: Standard corn = 70,000 ha, soy = 300,000 ha
  let density_seeds_ha = crop === "corn" ? 70000 : 320000;
  // If optimal temp & moisture, slightly push density. If low temperature, reduce.
  if (soil_temp_c < tempThreshold) {
    density_seeds_ha = Math.round(density_seeds_ha * 0.9);
  } else if (isi_score > 85) {
    density_seeds_ha = Math.round(density_seeds_ha * 1.05);
  }

  // Fertilization Strategy
  // Rule 3: Sandy + >30mm precip -> high leaching risk -> ADJUST fertilization (lower or split)
  let fertilization_strategy = "STANDARD_BALANCED";
  let fertilizer_dose_kg_ha = 100;
  let fertilizer_type = "MAP (Fosfato Monoamónico)";
  
  if (crop === "corn") {
    fertilizer_type = "Urea + MAP (Mezcla física)";
    if (soil_type === "loamy") {
      fertilizer_dose_kg_ha = 140;
    } else if (soil_type === "clayey") {
      fertilizer_dose_kg_ha = 120;
    } else { // sandy
      fertilizer_dose_kg_ha = 95;
    }
    // Modificador por lluvias y lixiviación
    if (forecast_precip_24h_mm > 30 && soil_type === "sandy") {
      fertilizer_dose_kg_ha = 65; // dosis baja de inicio, fraccionado posterior para evitar lixiviación
      fertilization_strategy = "SPLIT_LOW_IMMEDIATE_HIGH_LATER_LOW";
    } else if (isi_score > 80) {
      fertilizer_dose_kg_ha = 160; // mayor asimilación potencial
      fertilization_strategy = "HIGH_EFFICIENCY_TECH";
    } else if (isi_score < 45) {
      fertilizer_dose_kg_ha = 50; // dosis preventiva baja
      fertilization_strategy = "POSTPONED_CONSERVATIVE";
    }
  } else { // soy
    fertilizer_type = "SPS (Superfosfato Simple)";
    if (soil_type === "loamy") {
      fertilizer_dose_kg_ha = 95;
    } else if (soil_type === "clayey") {
      fertilizer_dose_kg_ha = 85;
    } else { // sandy
      fertilizer_dose_kg_ha = 60;
    }
    // Modificador por lluvias
    if (forecast_precip_24h_mm > 30 && soil_type === "sandy") {
      fertilizer_dose_kg_ha = 45;
      fertilization_strategy = "SPLIT_LOW_IMMEDIATE_HIGH_LATER_LOW";
    } else if (isi_score > 80) {
      fertilizer_dose_kg_ha = 110;
      fertilization_strategy = "HIGH_EFFICIENCY_TECH";
    } else if (isi_score < 45) {
      fertilizer_dose_kg_ha = 35;
      fertilization_strategy = "POSTPONED_CONSERVATIVE";
    }
  }

  // Confidence level: base + modifiers
  let confidence_level_pct = 85;
  if (soil_temp_c < 5 || soil_moisture_pct < 8) {
    confidence_level_pct = 70; // extremas
  } else if (isi_score > 90) {
    confidence_level_pct = 95;
  }

  // Alerts
  const alerts: string[] = [];
  if (soil_temp_c < tempThreshold) {
    alerts.push(
      `⚠️ Alerta Térmica: Temperatura del suelo (${soil_temp_c}°C) por debajo del umbral óptimo de ${tempThreshold}°C para ${
        crop === "corn" ? "Maíz" : "Soja"
      }. Se recomienda postergar.`
    );
  }
  if (soil_type === "sandy" && soil_moisture_pct < 15) {
    alerts.push(
      `⚠️ Riesgo de Emergencia Irregular: Suelo arenoso con baja humedad (${soil_moisture_pct}%). Compensando con profundidad sugerida de ${seeding_depth_cm} cm.`
    );
  }
  if (soil_type === "sandy" && forecast_precip_24h_mm > 30) {
    alerts.push(
      `⚠️ Peligro de Lixiviación Extrema: Pronóstico de lluvia (${forecast_precip_24h_mm}mm) en suelo arenoso lavará nutrientes activos (N y K).`
    );
  } else if (forecast_precip_24h_mm > 40) {
    alerts.push(
      `⚠️ Riesgo de Encostramiento/Anoxia: Precipitación alta (${forecast_precip_24h_mm}mm) puede compactar el suelo o asfixiar semillas.`
    );
  }

  if (alerts.length === 0) {
    alerts.push(
      "✅ Sin alertas críticas detectadas. Ventana óptima de siembra lista para su ejecución."
    );
  }

  // Pure nutrients calculation for professional agronomic prescriptions
  let pure_n = 0;
  let pure_p = 0;
  let pure_k = 0;
  let pure_s = 0; // Sulfur for soy
  let yield_est = "";
  let associated_risk = "";
  let recommended_nutrients_list = "";
  let recommended_dose_list = "";
  let unit_exact_list = "";
  let fertilizer_source_name = "";
  let commercial_equivalence = "";
  let min_pure_dose = "";
  let max_pure_dose = "";

  if (crop === "corn") {
    let base_n = soil_type === "loamy" ? 80 : soil_type === "clayey" ? 68 : 55;
    let base_p = soil_type === "loamy" ? 32 : soil_type === "clayey" ? 27 : 22;
    let base_k = soil_type === "sandy" ? 15 : 0;

    // Modifiers
    if (forecast_precip_24h_mm > 30 && soil_type === "sandy") {
      base_n = 30; // split to avoid leaching
    } else if (isi_score > 80) {
      base_n = Math.round(base_n * 1.15);
      base_p = Math.round(base_p * 1.15);
    } else if (isi_score < 45) {
      base_n = Math.round(base_n * 0.5);
      base_p = Math.round(base_p * 0.5);
    }

    pure_n = base_n;
    pure_p = base_p;
    pure_k = base_k;

    recommended_nutrients_list = "Nitrógeno (N), Fósforo (P)" + (pure_k > 0 ? " y Potasio (K)" : "");
    recommended_dose_list = `• Nitrógeno (N): ${pure_n} kg N/ha\n• Fósforo (P): ${pure_p} kg P/ha` + (pure_k > 0 ? `\n• Potasio (K): ${pure_k} kg K/ha` : "");
    unit_exact_list = "kg N/ha, kg P/ha" + (pure_k > 0 ? ", kg K/ha" : "");

    fertilizer_source_name = pure_k > 0 
      ? "Urea (46-0-0) + MAP (11-52-0) + KCl (0-0-60)" 
      : "Urea (46-0-0) + MAP (Fosfato Monoamónico 11-52-0)";
    commercial_equivalence = `Mezcla física de fuentes comerciales a dosis total de ${fertilizer_dose_kg_ha} kg/ha.`;

    min_pure_dose = `• Nitrógeno mín: ${Math.round(pure_n * 0.75)} kg N/ha\n• Fósforo mín: ${Math.round(pure_p * 0.75)} kg P/ha` + (pure_k > 0 ? `\n• Potasio mín: ${Math.round(pure_k * 0.75)} kg K/ha` : "");
    max_pure_dose = `• Nitrógeno máx: ${Math.round(pure_n * 1.25)} kg N/ha\n• Fósforo máx: ${Math.round(pure_p * 1.25)} kg P/ha` + (pure_k > 0 ? `\n• Potasio máx: ${Math.round(pure_k * 1.25)} kg K/ha` : "");

    if (isi_score >= 81) {
      yield_est = `${Math.round(8500 + isi_score * 20)} - ${Math.round(9200 + isi_score * 20)} kg/ha (Óptimo potencial productivo)`;
    } else if (isi_score >= 61) {
      yield_est = `${Math.round(7500 + isi_score * 18)} - ${Math.round(8100 + isi_score * 18)} kg/ha (Implantación favorable)`;
    } else {
      yield_est = `${Math.round(5500 + isi_score * 15)} - ${Math.round(6200 + isi_score * 15)} kg/ha (Rendimiento severamente restringido)`;
    }

    if (forecast_precip_24h_mm > 30 && soil_type === "sandy") {
      associated_risk = "Elevado riesgo de lixiviación de nitrógeno soluble. Se aconseja fraccionar la dosis.";
    } else if (soil_type === "clayey" && soil_moisture_pct > 32) {
      associated_risk = "Riesgo de desnitrificación biológica por asfixia del suelo arcilloso saturado.";
    } else {
      associated_risk = "Bajo riesgo asociado. Pérdidas por volatilización mínimas si el fertilizante se incorpora mecánicamente.";
    }
  } else {
    // Soy
    let base_p = soil_type === "loamy" ? 22 : soil_type === "clayey" ? 18 : 14;
    let base_k = soil_type === "sandy" ? 12 : 0;
    pure_s = soil_type === "loamy" ? 10 : soil_type === "clayey" ? 8 : 6;

    if (isi_score > 80) {
      base_p = Math.round(base_p * 1.15);
      pure_s = Math.round(pure_s * 1.15);
    } else if (isi_score < 45) {
      base_p = Math.round(base_p * 0.5);
      pure_s = Math.round(pure_s * 0.5);
    }

    pure_p = base_p;
    pure_k = base_k;

    recommended_nutrients_list = "Fósforo (P), Azufre (S)" + (pure_k > 0 ? " y Potasio (K)" : "") + " (Nitrógeno N = 0 kg/ha gracias a nodulación simbiótica)";
    recommended_dose_list = `• Fósforo (P): ${pure_p} kg P/ha\n• Azufre (S): ${pure_s} kg S/ha` + (pure_k > 0 ? `\n• Potasio (K): ${pure_k} kg K/ha` : "");
    unit_exact_list = "kg P/ha, kg S/ha" + (pure_k > 0 ? ", kg K/ha" : "");

    fertilizer_source_name = "SPS (Superfosfato Simple de Calcio, 0-20-0-12S)";
    commercial_equivalence = `Aplicación localizada en línea de exactamente ${fertilizer_dose_kg_ha} kg/ha de SPS comercial.`;

    min_pure_dose = `• Fósforo mín: ${Math.round(pure_p * 0.75)} kg P/ha\n• Azufre mín: ${Math.round(pure_s * 0.75)} kg S/ha` + (pure_k > 0 ? `\n• Potasio mín: ${Math.round(pure_k * 0.75)} kg K/ha` : "");
    max_pure_dose = `• Fósforo máx: ${Math.round(pure_p * 1.25)} kg P/ha\n• Azufre máx: ${Math.round(pure_s * 1.25)} kg S/ha` + (pure_k > 0 ? `\n• Potasio máx: ${Math.round(pure_k * 1.25)} kg K/ha` : "");

    if (isi_score >= 81) {
      yield_est = `${Math.round(3100 + isi_score * 8)} - ${Math.round(3400 + isi_score * 8)} kg/ha (Óptima nodulación activa)`;
    } else if (isi_score >= 61) {
      yield_est = `${Math.round(2700 + isi_score * 7)} - ${Math.round(2900 + isi_score * 7)} kg/ha (Implantación estable)`;
    } else {
      yield_est = `${Math.round(1900 + isi_score * 5)} - ${Math.round(2200 + isi_score * 5)} kg/ha (Desarrollo limitado de nódulos)`;
    }

    if (soil_type === "clayey" && soil_moisture_pct > 32) {
      associated_risk = "Dificultad de nodulación por Rhizobium inducido por anoxia en suelo arcilloso saturado.";
    } else if (soil_type === "sandy" && soil_moisture_pct < 15) {
      associated_risk = "Baja solubilización de fósforo y riesgo de fitotoxicidad salina localizada por escasez hídrica.";
    } else {
      associated_risk = "Bajo riesgo asociado. Estabilidad nutricional fosfo-sulfatada alta.";
    }
  }

  return {
    isi_score,
    classification,
    ui_color_code,
    confidence_level_pct,
    prescriptions: {
      seeding_depth_cm: parseFloat(seeding_depth_cm.toFixed(1)),
      density_seeds_ha,
      fertilization_strategy,
      fertilizer_dose_kg_ha,
      fertilizer_type,
      professional_fertilizer: {
        recomendacion_principal: {
          nutrientes: recommended_nutrients_list,
          dosis_poblada: recommended_dose_list,
          dosis_valores: {
            n: pure_n,
            p: pure_p,
            k: pure_k,
            s: pure_s
          },
          unidades: unit_exact_list
        },
        fuente_sugerida: {
          fertilizante: fertilizer_source_name,
          equivalencia_comercial: commercial_equivalence
        },
        rango_operativo: {
          dosis_minima: min_pure_dose,
          dosis_maxima: max_pure_dose
        },
        impacto_esperado: {
          rendimiento_estimado: yield_est,
          riesgo_asociado: associated_risk
        }
      }
    },
    alerts,
  };
}

export const app = express();
app.use(express.json());

// API Healthcheck
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "SmartSeed AI server is live." });
});

// GET Supabase and Local History status
  app.get("/api/supabase-status", async (req, res) => {
    const currentUrl = process.env.SUPABASE_URL || "";
    const currentKey = process.env.SUPABASE_ANON_KEY || "";
    const hasUrl = !!currentUrl;
    const hasKey = !!currentKey;
    const isValid = isValidSupabaseUrl(currentUrl);
    const client = isValid ? getSupabaseClient() : null;
    let connected = false;
    let tableExists = false;
    let errorMessage = "";
    let recordCount = 0;

    if (client) {
      try {
        // Try to fetch 1 row to see if connected and table exists
        const { data, error, count } = await client
          .from("smart_history")
          .select("id", { count: "exact", head: true });

        if (error) {
          errorMessage = error.message;
          if (
            error.code === "P0001" || 
            error.code === "42P01" || 
            error.message.toLowerCase().includes("does not exist") || 
            error.message.toLowerCase().includes("relation") ||
            error.message.toLowerCase().includes("schema cache")
          ) {
            tableExists = false;
            connected = true; // API credentials are valid, but table is missing
          }
        } else {
          connected = true;
          tableExists = true;
          recordCount = count || 0;
        }
      } catch (err: any) {
        errorMessage = err.message || "Unknown connection error";
      }
    } else if (hasUrl && !isValid) {
      errorMessage = "La URL de Supabase ingresada no es válida o es un marcador de posición de prueba (ej. Google).";
    }

    const schemaSql = `CREATE TABLE smart_history (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  crop TEXT NOT NULL,
  soil_type TEXT NOT NULL,
  soil_moisture_pct INTEGER NOT NULL,
  soil_temp_c INTEGER NOT NULL,
  forecast_precip_24h_mm INTEGER NOT NULL,
  isi INTEGER NOT NULL,
  recommendation TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);`;

    res.json({
      configured: hasUrl && hasKey && isValid,
      connected,
      tableExists,
      projectName: "SmartSeed-AI",
      supabaseUrl: currentUrl && isValid ? `${currentUrl.substring(0, 20)}...` : null,
      recordCount,
      errorMessage,
      schemaSql,
    });
  });

  // POST save credentials dynamically to memory and disk
  app.post("/api/save-supabase-credentials", async (req, res) => {
    let { url, key } = req.body || {};
    if (!url || !key) {
      return res.status(400).json({ success: false, error: "Faltan parámetros 'url' o 'key'." });
    }

    try {
      url = url.trim();
      if (url.endsWith("/")) {
        url = url.slice(0, -1);
      }
      if (url.endsWith("/rest/v1")) {
        url = url.substring(0, url.length - 8);
      }
      if (url.endsWith("/")) {
        url = url.slice(0, -1);
      }

      // 1. Update in-memory process.env
      process.env.SUPABASE_URL = url;
      process.env.SUPABASE_ANON_KEY = key;

      // 2. Clear old client instance so getSupabaseClient() recreates it
      supabaseClient = null;

      // 3. Write to .env file (safely, since Vercel has a read-only filesystem)
      try {
        const envPath = path.join(process.cwd(), ".env");
        let content = "";
        if (fs.existsSync(envPath)) {
          content = fs.readFileSync(envPath, "utf-8");
        } else {
          const examplePath = path.join(process.cwd(), ".env.example");
          if (fs.existsSync(examplePath)) {
            content = fs.readFileSync(examplePath, "utf-8");
          }
        }

        // Replace or add SUPABASE_URL
        if (content.includes("SUPABASE_URL=")) {
          content = content.replace(/SUPABASE_URL=.*/g, `SUPABASE_URL="${url}"`);
        } else {
          content += `\nSUPABASE_URL="${url}"`;
        }

        // Replace or add SUPABASE_ANON_KEY
        if (content.includes("SUPABASE_ANON_KEY=")) {
          content = content.replace(/SUPABASE_ANON_KEY=.*/g, `SUPABASE_ANON_KEY="${key}"`);
        } else {
          content += `\nSUPABASE_ANON_KEY="${key}"`;
        }

        fs.writeFileSync(envPath, content.trim() + "\n", "utf-8");
      } catch (writeErr) {
        console.warn("Could not write .env file (read-only filesystem on Vercel):", writeErr);
      }

      // 4. Test connection immediately
      const client = getSupabaseClient();
      let connected = false;
      let tableExists = false;
      let errorMsg = "";

      if (client) {
        const { error } = await client
          .from("smart_history")
          .select("id")
          .limit(1);

        if (error) {
          errorMsg = error.message;
          if (
            error.code === "P0001" || 
            error.code === "42P01" || 
            error.message.toLowerCase().includes("does not exist") || 
            error.message.toLowerCase().includes("relation") ||
            error.message.toLowerCase().includes("schema cache")
          ) {
            tableExists = false;
            connected = true; // Auth credentials are correct, but the table just hasn't been created yet!
          }
        } else {
          connected = true;
          tableExists = true;
        }
      }

      res.json({
        success: true,
        connected,
        tableExists,
        errorMessage: errorMsg
      });
    } catch (err: any) {
      console.error("Error saving Supabase credentials:", err);
      res.status(500).json({ success: false, error: err.message || "Error al guardar credenciales" });
    }
  });

  // GET History
  app.get("/api/history", async (req, res) => {
    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from("smart_history")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(15);

        if (!error && data) {
          return res.json({ success: true, source: "supabase", history: data });
        }
        console.warn("Supabase query failed, falling back to memory:", error?.message);
      } catch (err) {
        console.warn("Supabase query threw, falling back to memory:", err);
      }
    }
    res.json({ success: true, source: "memory", history: localHistory });
  });

  // POST History
  app.post("/api/history", async (req, res) => {
    const newItem = req.body;
    if (!newItem || !newItem.id) {
      return res.status(400).json({ success: false, error: "Invalid history item payload" });
    }

    // Add to local memory history first as fallback
    const duplicateIdx = localHistory.findIndex(h => h.id === newItem.id);
    if (duplicateIdx === -1) {
      localHistory = [newItem, ...localHistory].slice(0, 15);
    }

    const client = getSupabaseClient();
    if (client) {
      try {
        const { error } = await client
          .from("smart_history")
          .upsert({
            id: newItem.id,
            date: newItem.date,
            crop: newItem.crop,
            soil_type: newItem.soil_type,
            soil_moisture_pct: newItem.soil_moisture_pct,
            soil_temp_c: newItem.soil_temp_c,
            forecast_precip_24h_mm: newItem.forecast_precip_24h_mm,
            isi: newItem.isi,
            recommendation: newItem.recommendation,
          });

        if (!error) {
          return res.json({ success: true, source: "supabase", item: newItem });
        }
        console.warn("Supabase insert failed, saved to memory only:", error.message);
        return res.json({ success: true, source: "memory_warning", error: error.message, item: newItem });
      } catch (err: any) {
        console.warn("Supabase insert threw, saved to memory only:", err);
        return res.json({ success: true, source: "memory_error", error: err.message, item: newItem });
      }
    }

    res.json({ success: true, source: "memory", item: newItem });
  });

  // API 1: Analyze telemetry with Optional Gemini enrichment
  app.post("/api/analyze", async (req, res) => {
    try {
      const {
        crop = "corn",
        soil_moisture_pct,
        soil_type = "sandy",
        soil_temp_c,
        forecast_precip_24h_mm,
      } = req.body || {};

      // Convenciones numéricas robustas para evitar problemas de coerción en Vercel/Node
      const moisture = typeof soil_moisture_pct !== "undefined" && soil_moisture_pct !== null ? Number(soil_moisture_pct) : 14;
      const temp = typeof soil_temp_c !== "undefined" && soil_temp_c !== null ? Number(soil_temp_c) : 15;
      const precip = typeof forecast_precip_24h_mm !== "undefined" && forecast_precip_24h_mm !== null ? Number(forecast_precip_24h_mm) : 35;

      // Calculate base structured metrics deterministically to ensure agronomical logic
      const result = runStaticAnalysis(
        crop === "soy" ? "soy" : "corn",
        isNaN(moisture) ? 14 : moisture,
        soil_type === "sandy" || soil_type === "loamy" || soil_type === "clayey" ? soil_type : "sandy",
        isNaN(temp) ? 15 : temp,
        isNaN(precip) ? 35 : precip
      );

      // Now query Gemini for the ultra-premium custom generated reports in Spanish (Section 1)
      const ai = getGeminiClient();
      let executiveSummary = "";
      let justificationDepth = "";
      let justificationDensity = "";
      let justificationFertilizer = "";
      let finalRecommendation = "";

      if (ai) {
        try {
          const prompt = `Actúas como SmartSeed AI, un copiloto agronómico de agricultura de precisión 4.0. Genera descripciones detalladas de forma profesional, breve y técnica en español para campesinos y agrónomos. Mantén las respuestas extremadamente directas, concisas y rápidas.
Variables del lote actual:
- Cultivo: ${crop === "corn" ? "Maíz" : "Soja"}
- Tipo de suelo: ${
            soil_type === "sandy"
              ? "Arenoso"
              : soil_type === "loamy"
              ? "Franco"
              : "Arcilloso"
          }
- Humedad del suelo: ${soil_moisture_pct}%
- Temperatura del suelo: ${soil_temp_c}°C
- Precipitación esperada (24h): ${forecast_precip_24h_mm} mm

Métricas recalculadas con precisión numérica:
- Índice de Siembra Inteligente (ISI): ${result.isi_score}/100
- Clasificación: ${result.classification}
- Profundidad de siembra sugerida: ${result.prescriptions.seeding_depth_cm} cm
- Densidad recomendada: ${result.prescriptions.density_seeds_ha} semillas/ha
- Estrategia de fertilización: ${result.prescriptions.fertilization_strategy}
- Dosis de fertilizante recomendada: ${result.prescriptions.fertilizer_dose_kg_ha} kg/ha de ${result.prescriptions.fertilizer_type}
- Alertas activas: ${JSON.stringify(result.alerts)}

INSTRUCCIÓN CRÍTICA DE PRECISIÓN NUMÉRICA:
Cuando justifiques o comentes la dosis, profundidad, densidad o fertilización, debes incluir SIEMPRE el valor numérico exacto estimado y su unidad correspondiente (ej: "3.5 cm", "72,500 semillas/ha", "140 kg/ha de Urea + MAP"), detallando la justificación técnica agronómica y el nivel de confianza de ${result.confidence_level_pct}%. No respondas únicamente con conceptos generales vagos.

Responde ÚNICAMENTE en formato de JSON limpio con las siguientes claves (sé ultra conciso para optimizar velocidad):
{
  "executive_summary": "Una conclusión ejecutiva técnica del lote (máximo 1-2 oraciones directas)",
  "justification_depth": "Justificación agronómica breve de por qué se prescribe exactamente ${
    result.prescriptions.seeding_depth_cm
  } cm de profundidad",
  "justification_density": "Justificación concisa para sugerir exactamente ${
    result.prescriptions.density_seeds_ha
  } semillas/ha",
  "justification_fertilizer": "Recomendación justificada técnicamente de fertilización para aplicar exactamente ${
    result.prescriptions.fertilizer_dose_kg_ha
  } kg/ha de ${result.prescriptions.fertilizer_type} bajo la estrategia ${result.prescriptions.fertilization_strategy}",
  "final_recommendation": "Acción estratégica inmediata de siembra"
}`;

          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          });

          const parsed = JSON.parse(response.text || "{}");
          executiveSummary = parsed.executive_summary || "";
          justificationDepth = parsed.justification_depth || "";
          justificationDensity = parsed.justification_density || "";
          justificationFertilizer = parsed.justification_fertilizer || "";
          finalRecommendation = parsed.final_recommendation || "";
        } catch (gemIniError) {
          console.error("Gemini context generation failed, using fallbacks:", gemIniError);
        }
      }

      // Fallbacks if Gemini was disabled or failed
      if (!executiveSummary) {
        if (result.isi_score < 40) {
          executiveSummary = `Condiciones de lote sumamente adversas. La temperatura baja o humedad crítica prohíben iniciar la operación de siembra en este momento. Reprogramar monitoreo.`;
        } else if (result.isi_score < 80) {
          executiveSummary = `El escenario presenta restricciones físicas de humedad o lixiviación de nutrientes, pero con ajustes operacionales precisos en profundidad y dosificación es factible proceder.`;
        } else {
          executiveSummary = `Escenario de alta productividad. Las variables de humedad, temperatura y clima están perfectamente alineadas con las demandas biológicas del híbrido.`;
        }
      }

      if (!justificationDepth) {
        if (soil_type === "sandy" && soil_moisture_pct < 15) {
          justificationDepth = `Debido a la alta macroporosidad del suelo arenoso y su baja retención hídrica instantánea, se prescribe profundizar la siembra a exactamente ${result.prescriptions.seeding_depth_cm} cm para anclar la semilla en horizontes con humedad residual estable. Nivel de confianza: ${result.confidence_level_pct}%.`;
        } else {
          justificationDepth = `Profundidad estándar de exactamente ${result.prescriptions.seeding_depth_cm} cm fijada de acuerdo al balance físico del lote y para garantizar una óptima emergencia. Nivel de confianza: ${result.confidence_level_pct}%.`;
        }
      }

      if (!justificationDensity) {
        justificationDensity = `Distribución de exactamente ${result.prescriptions.density_seeds_ha.toLocaleString()} semillas/ha ajustada según el balance térmico-hídrico proyectado para maximizar el índice de cosecha y evitar competencia intraespecífica. Nivel de confianza: ${result.confidence_level_pct}%.`;
      }

      if (!justificationFertilizer) {
        if (soil_type === "sandy" && forecast_precip_24h_mm > 30) {
          justificationFertilizer = `Estrategia fraccionada. Se prescribe una dosis reducida de base de exactamente ${result.prescriptions.fertilizer_dose_kg_ha} kg/ha de ${result.prescriptions.fertilizer_type} para prevenir lavado por lixiviación extrema; aplicar remanente post-emergencia en V4. Nivel de confianza: ${result.confidence_level_pct}%.`;
        } else {
          justificationFertilizer = `Dosificación balanceada óptima de exactamente ${result.prescriptions.fertilizer_dose_kg_ha} kg/ha de ${result.prescriptions.fertilizer_type} para potenciar el arranque vigoroso radicular. Nivel de confianza: ${result.confidence_level_pct}%.`;
        }
      }

      if (!finalRecommendation) {
        finalRecommendation = `Proceder bajo el protocolo de monitoreo SmartSeed. Ventana favorable recomendada para las próximas 36-72 horas. Potencial de implantación estimado del 92%.`;
      }

      // Format clean Section 1 Output
      const classificationTxt =
        result.classification === "OPTIMAL"
          ? "Óptima"
          : result.classification === "FAVORABLE"
          ? "Favorable"
          : result.classification === "MODERATE_RISK"
          ? "Riesgo Moderado"
          : "No Recomendable";

      const section_1_text = `📊 DASHBOARD DE ANÁLISIS INTEGRAL
- ISI (Índice de Siembra Inteligente): [${result.isi_score}/100] | Código de Color UI: [${result.ui_color_code}]
- Clasificación: [${classificationTxt}]
- Conclusión Ejecutivo: "${executiveSummary}"

🤖 PRESCRIPCIÓN DEL ASISTENTE SMARTSEED
- Profundidad de siembra recomendada: [${result.prescriptions.seeding_depth_cm} cm] - Justificación técnica: ${justificationDepth} (Confianza: ${result.confidence_level_pct}%)
- Densidad recomendada: [${result.prescriptions.density_seeds_ha.toLocaleString()} semillas/ha] - Justificación técnica: ${justificationDensity} (Confianza: ${result.confidence_level_pct}%)
- Estrategia de Fertilización: [${result.prescriptions.fertilization_strategy}] | Dosis Sugerida: [${result.prescriptions.fertilizer_dose_kg_ha} kg/ha de ${result.prescriptions.fertilizer_type}] - Justificación técnica: ${justificationFertilizer} (Confianza: ${result.confidence_level_pct}%)
- Nivel de Confianza del Modelo: [${result.confidence_level_pct}%] (Considerados: Humedad, Temperatura, Precipitación y Tipo de Suelo)

🚨 CENTRO DE ALERTAS ACTIVAS
${result.alerts.map((al) => `- ${al}`).join("\n")}

🧠 RECOMENDACIÓN ESTRATÉGICA FINAL
- ${finalRecommendation}`;

      // Build Section 2 Response
      const section_2_json = {
        status: "success",
        timestamp: new Date().toISOString(),
        telemetry_data: {
          crop,
          soil_moisture_pct,
          soil_type,
          soil_temp_c,
          forecast_precip_24h_mm,
        },
        analysis_output: {
          isi_score: result.isi_score,
          classification: result.classification,
          ui_color_code: result.ui_color_code,
          confidence_level_pct: result.confidence_level_pct,
          prescriptions: {
            seeding_depth_cm: result.prescriptions.seeding_depth_cm,
            density_seeds_ha: result.prescriptions.density_seeds_ha,
            fertilization_strategy: result.prescriptions.fertilization_strategy,
          },
        },
      };

      res.json({
        success: true,
        metrics: result,
        section_1: section_1_text,
        section_2: section_2_json,
        commentary: {
          executiveSummary,
          justificationDepth,
          justificationDensity,
          justificationFertilizer,
          finalRecommendation,
        },
      });
    } catch (err: any) {
      console.error("Analysis route error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Fallback local agronómico de alta fidelidad y precisión V5
  function generateLocalAgronomicResponse(message: string, telemetry: any): string {
    const isReport = /informe/i.test(message) || /reporte/i.test(message) || /completo/i.test(message);
    const cropText = telemetry.crop === "corn" ? "Maíz" : "Soja";
    const soilTypeText = telemetry.soil_type === "sandy" ? "Arenoso" : telemetry.soil_type === "clayey" ? "Arcilloso" : "Franco (Loamy)";
    
    const analysis = runStaticAnalysis(
      telemetry.crop,
      telemetry.soil_moisture_pct,
      telemetry.soil_type,
      telemetry.soil_temp_c,
      telemetry.forecast_precip_24h_mm
    );

    const scoreValue = analysis.isi_score;
    const classification = analysis.classification;
    const prescriptions = analysis.prescriptions;

    let riskPrincipal = "Ninguno crítico detectado bajo los umbrales estándar.";
    let riskSecundario = "Monitoreo regular recomendado durante el período de emergencia inicial.";

    if (telemetry.soil_temp_c < (telemetry.crop === "soy" ? 12 : 10)) {
      riskPrincipal = `Baja temperatura térmica en suelo (${telemetry.soil_temp_c}°C) que ralentiza el desarrollo germinativo del cultivo de ${cropText}.`;
      riskSecundario = "Aumento en la susceptibilidad a patógenos fúngicos debido a letargo biológico inducido.";
    } else if (telemetry.soil_moisture_pct < 15) {
      riskPrincipal = `Estrés por déficit hídrico inmediato debido a un contenido de humedad crítica (${telemetry.soil_moisture_pct}%).`;
      riskSecundario = `Implantación irregular esperada debido al escaso contacto semilla-suelo húmedo en suelo ${soilTypeText}.`;
    } else if (telemetry.forecast_precip_24h_mm > 35) {
      riskPrincipal = `Precipitaciones elevadas estimadas en el pronóstico (${telemetry.forecast_precip_24h_mm} mm) en ventana de siembra activa.`;
      riskSecundario = telemetry.soil_type === "sandy"
        ? "Lavado vertical de nutrientes activos (Lixiviación severa de Nitrógeno soluble)."
        : "Asfixia radicular parcial por anoxia temporal o encostramiento mecánico de la superficie.";
    }

    let accionSugerida = "Proceder con la implantación respetando la velocidad máxima recomendada del operador.";
    let ventanaOptima = "Ventana óptima abierta de forma inmediata (próximas 24-48 horas).";
    let potencialImplantacion = "Alto a Muy Alto (90-95%)";

    if (classification === "NOT_RECOMMENDED" || scoreValue < 45) {
      accionSugerida = "Diferir transitoriamente la siembra del lote. Monitorear diariamente la evolución de la temperatura física y el cese de lluvias.";
      ventanaOptima = "Ventana de siembra suspendida; reevaluar condiciones en un plazo de 5 a 7 días.";
      potencialImplantacion = "Bajo a Crítico (Menor al 60% de logro esperado).";
    } else if (classification === "MODERATE_RISK" || scoreValue < 65) {
      accionSugerida = "Sembrar bajo protocolo preventivo: ajustar levemente la profundidad operativa para resguardar la humedad de asiento de semilla.";
      ventanaOptima = "Ventana marginal abierta; planificar siembra en sectores llanos en un lapso de 3 a 4 días.";
      potencialImplantacion = "Moderado (70-80% de logro esperado).";
    }

    const checklist = `FACTORES ANALIZADOS
✓ Humedad del suelo (${telemetry.soil_moisture_pct}%)
✓ Temperatura (${telemetry.soil_temp_c}°C)
✓ Tipo de suelo (${soilTypeText})
✓ Pronóstico climático (${telemetry.forecast_precip_24h_mm} mm)
✓ Cultivo (${cropText})
✓ ISI (${scoreValue}/100)`;

    const profFert = prescriptions.professional_fertilizer;
    const professionalFertilizerText = `

**RECOMENDACIÓN DE NUTRIENTES PUROS (PRESCRIPCIÓN PROFESIONAL)**:

RECOMENDACIÓN PRINCIPAL
• Nutrientes recomendados: ${profFert.recomendacion_principal.nutrientes}
• Dosis pura recomendada:
${profFert.recomendacion_principal.dosis_poblada}
• Unidades exactas: ${profFert.recomendacion_principal.unidades}

FUENTE SUGERIDA
• Fertilizante recomendado: ${profFert.fuente_sugerida.fertilizante}
• Equivalencia comercial: ${profFert.fuente_sugerida.equivalencia_comercial}

RANGO OPERATIVO
• Dosis mínima pura:
${profFert.rango_operativo.dosis_minima}
• Dosis máxima pura:
${profFert.rango_operativo.dosis_maxima}

IMPACTO ESPERADO
• Rendimiento estimado: ${profFert.impacto_esperado.rendimiento_estimado}
• Riesgo asociado: ${profFert.impacto_esperado.riesgo_asociado}
`;

    if (isReport) {
      return `📊 **INFORME COMPLETO DE PRECISIÓN SMARTSEED**

### 📊 RESUMEN EJECUTIVO
- **🌱 Cultivo**: ${cropText}
- **💧 Humedad**: ${telemetry.soil_moisture_pct}%
- **🌡 Temperatura**: ${telemetry.soil_temp_c}°C
- **🌍 Tipo de suelo**: ${soilTypeText}
- **🌧 Pronóstico**: ${telemetry.forecast_precip_24h_mm} mm para las próximas 24h

### 📈 ISI
- **ISI Actual**: ${scoreValue}/100
- **Clasificación**: ${classification}
- **Impacto del ISI**: El diagnóstico agronómico de precisión clasifica este lote como **${classification}** con un score de **${scoreValue}/100**. ${
        scoreValue >= 81
          ? "Las variables físicas actuales confluyen en un entorno favorable para una siembra segura y uniforme. El ISI convalida la viabilidad operativa inmediata."
          : scoreValue >= 61
          ? "El índice refleja condiciones operativas viables pero con ciertas limitaciones. Se aconseja seguir las prescripciones ajustadas de profundidad y densidad."
          : "Se registran limitaciones críticas en el lote de siembra. El ISI desaconseja iniciar operaciones para prevenir pérdidas irreparables en la implantación."
      }

### 🤖 PRESCRIPCIÓN SMARTSEED
- **Profundidad recomendada**: ${prescriptions.seeding_depth_cm} cm
- **Densidad recomendada**: ${prescriptions.density_seeds_ha.toLocaleString("es-AR")} semillas/ha
- **Estrategia de fertilización**: ${prescriptions.fertilization_strategy}
- **Dosis recomendada**: ${prescriptions.fertilizer_dose_kg_ha} kg/ha de ${prescriptions.fertilizer_type}

${professionalFertilizerText}

### 🚨 RIESGOS DETECTADOS
- **Riesgo principal**: ${riskPrincipal}
- **Riesgo secundario**: ${riskSecundario}

### 🧠 CONCLUSIÓN ESTRATÉGICA
- **Acción recomendada**: ${accionSugerida}
- **Ventana óptima de siembra**: ${ventanaOptima}
- **Potencial de implantación**: ${potencialImplantacion}

### 📌 NIVEL DE CONFIANZA
- **Nivel de confianza**: ${analysis.confidence_level_pct}% (${analysis.confidence_level_pct >= 90 ? "Datos completos" : "Datos suficientes"})
- **Checklist de Explicabilidad**:
${checklist}`;
    } else {
      // Formato Técnico Obligatorio de 6 Puntos
      return `### 1. Diagnóstico rápido
Para el cultivo de **${cropText}** en suelo de textura **${soilTypeText}** (Humedad: ${telemetry.soil_moisture_pct}%, Temp: ${telemetry.soil_temp_c}°C, Pronóstico: ${telemetry.forecast_precip_24h_mm} mm), ${
        scoreValue >= 81
          ? "se detecta un escenario excelente para proceder con las operaciones de siembra de precisión. Las condiciones térmicas y de humedad garantizan un nacimiento uniforme."
          : scoreValue >= 61
          ? "se observan condiciones favorables estables, aunque persisten limitaciones menores que exigen un calibrado minucioso de la sembradora."
          : "se advierte una situación de alto riesgo agronómico por condiciones desfavorables de temperatura, excesos hídricos o sequedad severa."
      }

### 2. Recomendación agronómica
Se prescriben los siguientes parámetros operativos y nutricionales específicos de precisión:
- **Parámetros de Siembra**:
  * **Profundidad recomendada**: **${prescriptions.seeding_depth_cm} cm**
  * **Densidad de distribución**: **${prescriptions.density_seeds_ha.toLocaleString("es-AR")} semillas/ha**
- **Parámetros de Nutrición**:
  * **Estrategia sugerida**: **${prescriptions.fertilization_strategy}**
  * **Dosis recomendada**: **${prescriptions.fertilizer_dose_kg_ha} kg/ha** de **${prescriptions.fertilizer_type}**

${professionalFertilizerText}
- **Justificación Técnica**: Se calibra la profundidad de siembra a ${prescriptions.seeding_depth_cm} cm para encontrar humedad residual idónea y evitar la desecación capilar en textura ${soilTypeText}. La densidad de ${prescriptions.density_seeds_ha.toLocaleString("es-AR")} sem/ha y la dosis de ${prescriptions.fertilizer_dose_kg_ha} kg/ha previenen la competencia intraespecífica innecesaria y el riesgo de lixiviación hídrica.
- **Nivel de Confianza**: **${analysis.confidence_level_pct}%** (Datos suficientes procesados por el motor de inferencia)

### 3. ISI y clasificación
- **ISI Actual**: ${scoreValue}/100
- **Clasificación**: **${classification}**
- **Impacto**: El índice de ${scoreValue}/100 califica la aptitud del lote como **${classification}**. Esta puntuación indica que la recomendación se considera viable bajo las precauciones operativas detalladas, orientadas a amortiguar las fluctuaciones del suelo.

### 4. Factores analizados
${checklist}

### 5. Nivel de confianza
Nivel de confianza: ${analysis.confidence_level_pct}% (${analysis.confidence_level_pct >= 90 ? "Datos completos" : "Datos suficientes"})

### 6. Acción sugerida
**Acción estratégica**: ${accionSugerida}
**Ventana óptima**: ${ventanaOptima}`;
    }
  }

  // API 2: Copilot Chat Route
  app.post("/api/chat", async (req, res) => {
    const { message, telemetry } = req.body || {};

    if (!telemetry) {
      return res.status(400).json({ success: false, error: "Missing telemetry parameter" });
    }

    try {
      // Safe numeric conversions for telemetry inside chat
      const safeCrop = telemetry.crop === "soy" ? "soy" : "corn";
      const safeSoilType = telemetry.soil_type === "sandy" || telemetry.soil_type === "loamy" || telemetry.soil_type === "clayey" ? telemetry.soil_type : "sandy";
      const safeMoisture = typeof telemetry.soil_moisture_pct !== "undefined" && telemetry.soil_moisture_pct !== null ? Number(telemetry.soil_moisture_pct) : 14;
      const safeTemp = typeof telemetry.soil_temp_c !== "undefined" && telemetry.soil_temp_c !== null ? Number(telemetry.soil_temp_c) : 15;
      const safePrecip = typeof telemetry.forecast_precip_24h_mm !== "undefined" && telemetry.forecast_precip_24h_mm !== null ? Number(telemetry.forecast_precip_24h_mm) : 35;

      const ai = getGeminiClient();
      if (!ai) {
        const text = generateLocalAgronomicResponse(message, {
          crop: safeCrop,
          soil_type: safeSoilType,
          soil_moisture_pct: safeMoisture,
          soil_temp_c: safeTemp,
          forecast_precip_24h_mm: safePrecip
        });
        return res.json({ reply: text });
      }

      const analysis = runStaticAnalysis(
        safeCrop,
        isNaN(safeMoisture) ? 14 : safeMoisture,
        safeSoilType,
        isNaN(safeTemp) ? 15 : safeTemp,
        isNaN(safePrecip) ? 35 : safePrecip
      );

      const systemPrompt = `Eres SmartSeed AI, un copiloto experto agronómico en Agricultura de Precisión 4.0 de alta gama.
Tu misión es asistir a productores y agrónomos en decisiones de siembra de alta precisión, control hídrico, fertilización y labranza.

TELEMETRÍA ACTUAL DEL LOTE:
- Cultivo Activo: ${safeCrop === "corn" ? "Maíz" : "Soja"}
- Textura del Suelo: ${safeSoilType === "sandy" ? "Arenoso" : safeSoilType === "clayey" ? "Arcilloso" : "Franco (Loamy)"}
- Humedad actual del suelo: ${safeMoisture}%
- Temperatura actual del suelo: ${safeTemp}°C
- Pronóstico climático de lluvia (próximas 24h): ${safePrecip} mm

SISTEMA OPERATIVO ISI CORE (VALORES OBLIGATORIOS CALCULADOS):
- Índice de Siembra Inteligente (ISI) actual: ${analysis.isi_score}/100
- Clasificación de Aptitud: ${analysis.classification}
- Profundidad de siembra sugerida: ${analysis.prescriptions.seeding_depth_cm} cm
- Densidad recomendada: ${analysis.prescriptions.density_seeds_ha.toLocaleString("es-AR")} semillas/ha
- Estrategia de Fertilización: ${analysis.prescriptions.fertilization_strategy}
- Dosis de fertilización sugerida: ${analysis.prescriptions.fertilizer_dose_kg_ha} kg/ha de ${analysis.prescriptions.fertilizer_type}
- Nivel de confianza del modelo: ${analysis.confidence_level_pct}%

PRESCRIPCIÓN NUTRICIONAL PROFESIONAL ADICIONAL:
- Nutrientes recomendados (puros): ${analysis.prescriptions.professional_fertilizer.recomendacion_principal.nutrientes}
- Dosis recomendada pura:
${analysis.prescriptions.professional_fertilizer.recomendacion_principal.dosis_poblada}
- Unidad exacta: ${analysis.prescriptions.professional_fertilizer.recomendacion_principal.unidades}
- Fertilizante recomendado (fuente comercial): ${analysis.prescriptions.professional_fertilizer.fuente_sugerida.fertilizante}
- Equivalencia comercial: ${analysis.prescriptions.professional_fertilizer.fuente_sugerida.equivalencia_comercial}
- Dosis mínima pura:
${analysis.prescriptions.professional_fertilizer.rango_operativo.dosis_minima}
- Dosis máxima pura:
${analysis.prescriptions.professional_fertilizer.rango_operativo.dosis_maxima}
- Rendimiento estimado: ${analysis.prescriptions.professional_fertilizer.impacto_esperado.rendimiento_estimado}
- Riesgo asociado: ${analysis.prescriptions.professional_fertilizer.impacto_esperado.riesgo_asociado}

DIRECTIVAS ABSOLUTAS DE RESPUESTA:

1. RESPUESTAS CONTEXTUALIZADAS: Está estrictamente prohibido responder de forma genérica. Cada sugerencia, advertencia o explicación debe estar vinculada directamente a la telemetría actual de este lote (el cultivo de ${telemetry.crop === "corn" ? "Maíz" : "Soja"}, humedad de ${telemetry.soil_moisture_pct}%, suelo de tipo ${telemetry.soil_type === "sandy" ? "Arenoso" : telemetry.soil_type === "clayey" ? "Arcilloso" : "Franco"} y temperatura de ${telemetry.soil_temp_c}°C).

2. DIRECTIVA DE PRECISIÓN NUMÉRICA EN CONSULTAS: Cuando el usuario consulte o pregunte por dosis, cantidades, profundidades, densidades o niveles de fertilización, es MANDATORIO que proporciones valores numéricos específicos estimados basándote en los valores obligatorios calculados. NUNCA respondas con conceptos o estrategias generales vagas.
Tu respuesta sobre estos conceptos siempre debe listar explícitamente:
- **Valor recomendado**: [Valor numérico preciso, ej: ${analysis.prescriptions.seeding_depth_cm}, ${analysis.prescriptions.density_seeds_ha.toLocaleString("es-AR")}, o ${analysis.prescriptions.fertilizer_dose_kg_ha}]
- **Unidad correspondiente**: [La unidad técnica, ej: "cm", "semillas/ha", o "kg/ha de ${analysis.prescriptions.fertilizer_type}"]
- **Justificación técnica**: [Explicación agronómica detallada y adaptada a la textura ${telemetry.soil_type === "sandy" ? "Arenoso" : telemetry.soil_type === "clayey" ? "Arcilloso" : "Franco"}, humedad de ${telemetry.soil_moisture_pct}%, temp de ${telemetry.soil_temp_c}°C y previsión pluvial de ${telemetry.forecast_precip_24h_mm} mm]
- **Nivel de confianza**: [Porcentaje exacto, ej: ${analysis.confidence_level_pct}% (especificando si los datos son completos, suficientes o parciales)]

3. DETECCIÓN DE INFORME COMPLETO: Si el mensaje del usuario pide generar un informe completo, o contiene los términos "informe", "reporte" o "completo" (sin importar mayúsculas/minúsculas), debes estructurar la respuesta utilizando EXACTAMENTE el siguiente formato Markdown:

📊 **INFORME COMPLETO DE PRECISIÓN SMARTSEED**

### 📊 RESUMEN EJECUTIVO
- **🌱 Cultivo**: [Nombre del cultivo, ej: Maíz o Soja]
- **💧 Humedad**: [Humedad actual]%
- **🌡 Temperatura**: [Temperatura actual]°C
- **🌍 Tipo de suelo**: [Tipo de suelo]
- **🌧 Pronóstico**: [Lluvia pronosticada] mm para las próximas 24h

### 📈 ISI
- **ISI Actual**: [Score]/100
- **Clasificación**: [Clasificación]
- **Impacto del ISI**: [Detalle técnico riguroso de cómo afecta el ISI de [Score]/100 a la viabilidad física del lote]

### 🤖 PRESCRIPCIÓN SMARTSEED
- **Profundidad recomendada**: [Profundidad] cm
- **Densidad recomendada**: [Densidad] semillas/ha
- **Estrategia de fertilización**: [Estrategia] y dosis sugerida de exactamente ${analysis.prescriptions.fertilizer_dose_kg_ha} kg/ha de ${analysis.prescriptions.fertilizer_type}

### 🚨 RIESGOS DETECTADOS
- **Riesgo principal**: [Definir riesgo agronómico clave basándose en la telemetría]
- **Riesgo secundario**: [Definir riesgo secundario asociado]

### 🧠 CONCLUSIÓN ESTRATÉGICA
- **Acción recomendada**: [Acción inmediata aconsejada, ej: Sembrar o Diferir]
- **Ventana óptima de siembra**: [Ventana temporal idónea de acuerdo al pronóstico y temperatura]
- **Potencial de implantación**: [Nivel estimado, ej: Alto (85-90%)]

### 📌 NIVEL DE CONFIANZA
- **Nivel de confianza**: ${analysis.confidence_level_pct}% ([Datos completos / Datos suficientes / Datos parciales / Información insuficiente de acuerdo al porcentaje])

4. RESPUESTA TÉCNICA ESTÁNDAR: Para cualquier otra consulta que no sea un informe completo, tu respuesta técnica debe presentarse bajo la siguiente estructura obligatoria de 6 puntos en Markdown (e integrando en el punto 2 los campos numéricos detallados con sus unidades, justificación técnica y nivel de confianza):

### 1. Diagnóstico rápido
[Un diagnóstico corto y ultra contextualizado al lote actual]

### 2. Recomendación agronómica
[La recomendación técnica con valores numéricos específicos de profundidad de siembra, densidad de distribución y dosis específica de fertilización en kg/ha con justificación agronómica]

### 3. ISI y clasificación
- **ISI Actual**: [Score]/100
- **Clasificación**: **[Clasificación]**
- **Impacto**: [Análisis de cómo este ISI valida o restringe la recomendación de siembra]

### 4. Factores analizados
FACTORES ANALIZADOS
✓ Humedad del suelo ([Humedad]%)
✓ Temperatura ([Temperatura]°C)
✓ Tipo de suelo ([Tipo de suelo])
✓ Pronóstico climático ([Lluvia] mm)
✓ Cultivo ([Cultivo])
✓ ISI ([Score]/100)

### 5. Nivel de confianza
Nivel de confianza: [Porcentaje]% ([Clasificación de datos, ej: Datos suficientes])

### 6. Acción sugerida
[La acción operativa estratégica a tomar de forma inmediata]

5. PRESCRIPCIONES DE FERTILIZACIÓN PROFESIONALES: Cuando el usuario consulte o pregunte por dosis, fertilización, nutrientes, NPK o nutrición del cultivo, o cuando se genere un informe, es OBLIGATORIO responder utilizando la siguiente estructura exacta y priorizando los nutrientes puros (basándose en los valores calculados de la PRESCRIPCIÓN NUTRICIONAL PROFESIONAL ADICIONAL):

RECOMENDACIÓN PRINCIPAL
• Nutrientes recomendados: ${analysis.prescriptions.professional_fertilizer.recomendacion_principal.nutrientes}
• Dosis pura recomendada:
${analysis.prescriptions.professional_fertilizer.recomendacion_principal.dosis_poblada}
• Unidades exactas: ${analysis.prescriptions.professional_fertilizer.recomendacion_principal.unidades}

FUENTE SUGERIDA
• Fertilizante recomendado: ${analysis.prescriptions.professional_fertilizer.fuente_sugerida.fertilizante}
• Equivalencia comercial: ${analysis.prescriptions.professional_fertilizer.fuente_sugerida.equivalencia_comercial}

RANGO OPERATIVO
• Dosis mínima:
${analysis.prescriptions.professional_fertilizer.rango_operativo.dosis_minima}
• Dosis máxima:
${analysis.prescriptions.professional_fertilizer.rango_operativo.dosis_maxima}

IMPACTO ESPERADO
• Rendimiento estimado: ${analysis.prescriptions.professional_fertilizer.impacto_esperado.rendimiento_estimado}
• Riesgo asociado: ${analysis.prescriptions.professional_fertilizer.impacto_esperado.riesgo_asociado}

No respondas únicamente con kg/ha de producto comercial. Prioriza siempre la recomendación expresada en nutrientes puros.

6. IDIOMA: Responde enteramente en español técnico. No uses rodeos ni introducciones innecesarias. Sé directo, riguroso y profesional.`;

      const chat = ai.chats.create({
        model: "gemini-3.5-flash",
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.15,
        },
      });

      const response = await chat.sendMessage({ message });
      const text = response.text;
      return res.json({ reply: text });

    } catch (err: any) {
      console.warn("Gemini query failed or experienced high demand. Rolling over to static premium fallback rule-based agent:", err);
      const text = generateLocalAgronomicResponse(message, telemetry);
      return res.json({ reply: text });
    }
  });

  // Global error handling middleware to catch all uncaught route/API errors and return JSON instead of HTML
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("SmartSeed Express error handler caught:", err);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: err?.message || String(err),
      stack: process.env.NODE_ENV !== "production" ? err?.stack : undefined
    });
  });

  // Serve static UI assets under Vite or custom build static path (Only if NOT on Vercel)
  if (!process.env.VERCEL) {
    (async () => {
      try {
        if (process.env.NODE_ENV !== "production") {
          const { createServer: createViteServer } = await import("vite");
          const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
          });
          app.use(vite.middlewares);
        } else {
          // Production static serving (outside of Vercel, e.g., standard Docker/Node server)
          const distPath = path.join(process.cwd(), "dist");
          app.use(express.static(distPath));
          app.get("*", (req, res) => {
            res.sendFile(path.join(distPath, "index.html"));
          });
        }

        app.listen(PORT, "0.0.0.0", () => {
          console.log(`SmartSeed AI application server running on http://0.0.0.0:${PORT}`);
        });
      } catch (err) {
        console.error("Failed to start local development/production server:", err);
      }
    })();
  }

export default app;
