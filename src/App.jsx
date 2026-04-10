import { useState, useEffect, useCallback } from "react";

// ─── Mock tender data representing what scrapers would deliver ───────────────
const MOCK_TENDERS = [
  {
    id: "TED-2024-001",
    source: "TED",
    title: "Abbruch und Entsorgung Stahlkonstruktion BAB A8 – Brücke Km 47,3",
    contracting_authority: "Autobahn GmbH des Bundes",
    location: { nuts: "DE111", label: "Stuttgart, Baden-Württemberg" },
    published: "2024-03-12",
    deadline: "2024-04-15",
    cpv: ["45111100-9", "45262660-5"],
    value_eur: 850000,
    description: "Abbruch einer Stahlverbundbrücke, Schweißnahtschneiden, Entsorgung oder Veräußerung des Stahlschrotts, ca. 320t Stahl (17 04 05), Erdaushub ca. 1.200m³ (Bodenklasse 5-6)",
    raw_text: "Pos. 01.01 – Stahlträger demontieren, 40 kg/m, L=180m …",
    status: "unprocessed",
    n1c_relevance: null,
    material_flows: null,
  },
  {
    id: "AUTOBAHN-2024-087",
    source: "vergabe.autobahn.de",
    title: "Schutzplankenrückbau und -erneuerung A9 Nürnberg–München",
    contracting_authority: "Autobahn GmbH, NL Nordbayern",
    location: { nuts: "DE254", label: "Nürnberg, Bayern" },
    published: "2024-03-10",
    deadline: "2024-04-08",
    cpv: ["45233290-8"],
    value_eur: 420000,
    description: "Rückbau 3.400m Schutzplanke Typ A, Material verbleibt beim AN. Ca. 136t Stahl (17 04 05). Begleitende Erdarbeiten, Oberbodenabtrag 800m³.",
    raw_text: "LV Pos. 01 Schutzplankensystem SP-H2 zurückbauen…",
    status: "unprocessed",
    n1c_relevance: null,
    material_flows: null,
  },
  {
    id: "DTVP-2024-0443",
    source: "DTVP",
    title: "Erdarbeiten Neubau GVZ Erfurt – Bauabschnitt 3",
    contracting_authority: "Thüringer Aufbaubank (Vertreter)",
    location: { nuts: "DEG01", label: "Erfurt, Thüringen" },
    published: "2024-03-08",
    deadline: "2024-04-20",
    cpv: ["45112000-5"],
    value_eur: 1200000,
    description: "Bodenaushub ca. 45.000m³, Bodenklassen 3–5, Deponie oder Weiterverwertung, Bodengüte Z0/Z1.1, DIN 19731 konform. Schüttmaterial für benachbarte Projekte möglicherweise direkt verwertbar.",
    raw_text: "01.00 Oberboden abtragen und lagern, 2.000m³…",
    status: "analyzed",
    n1c_relevance: "HIGH",
    material_flows: [
      { type: "Erdaushub", quantity: "45.000 m³", avv: "17 05 04", classification: "Z0/Z1.1", direction: "outbound" }
    ],
  },
  {
    id: "TED-2024-002",
    source: "TED",
    title: "Kanalsanierung Hamburg-Harburg – Abschnitt 4",
    contracting_authority: "Hamburg Wasser",
    location: { nuts: "DE600", label: "Hamburg" },
    published: "2024-03-05",
    deadline: "2024-04-30",
    cpv: ["45232410-9"],
    value_eur: 2100000,
    description: "Grabenlose Sanierung DN800 Betonkanal, keine relevanten Materialströme für Weiterverwertung vorgesehen.",
    raw_text: "",
    status: "analyzed",
    n1c_relevance: "LOW",
    material_flows: [],
  },
  {
    id: "EVERGABE-2024-119",
    source: "evergabe.de",
    title: "Abriss Industriehalle Dessau – Stahlskelettbau",
    contracting_authority: "Stadt Dessau-Roßlau",
    location: { nuts: "DEE01", label: "Dessau-Roßlau, Sachsen-Anhalt" },
    published: "2024-03-14",
    deadline: "2024-05-10",
    cpv: ["45111100-9"],
    value_eur: 680000,
    description: "Vollständiger Abbruch Stahlskelettbau, BGF 4.200m², Baujahr 1978. Stahlträger und -stützen ca. 280t (17 04 05), Betonabbruch 1.800t. Material-Disposition obliegt dem AN.",
    raw_text: "Pos. 1.1 – Stahlstützen HEA 300, demontieren, 45 St. …",
    status: "unprocessed",
    n1c_relevance: null,
    material_flows: null,
  },
];

const SOURCE_CONFIG = {
  "TED": { color: "#0050AA", label: "TED EU" },
  "vergabe.autobahn.de": { color: "#E8500A", label: "Autobahn" },
  "DTVP": { color: "#1A7F4B", label: "DTVP" },
  "evergabe.de": { color: "#7B2D8B", label: "evergabe.de" },
};

const RELEVANCE_CONFIG = {
  HIGH: { color: "#16A34A", bg: "#DCFCE7", label: "Hoch" },
  MEDIUM: { color: "#D97706", bg: "#FEF3C7", label: "Mittel" },
  LOW: { color: "#6B7280", bg: "#F3F4F6", label: "Niedrig" },
};

// ─── Claude API call to analyze a tender ────────────────────────────────────
async function analyzeTenderWithClaude(tender) {
  const systemPrompt = `Du bist ein Experte für die Kreislaufwirtschaft im Bauwesen, spezialisiert auf die Identifikation von Materialströmen (Stahlschrott AVV 17 04 05, Erdaushub AVV 17 05 04) in deutschen und europäischen Bauausschreibungen.

Analysiere die Ausschreibung und antworte NUR mit einem JSON-Objekt, kein Markdown, keine Erklärungen:

{
  "n1c_relevance": "HIGH" | "MEDIUM" | "LOW",
  "relevance_reason": "Kurze Begründung (1-2 Sätze)",
  "material_flows": [
    {
      "type": "Stahlschrott" | "Erdaushub" | "Betonabbruch" | "Sonstiges",
      "quantity": "Menge mit Einheit",
      "quantity_numeric": Zahl,
      "unit": "t" | "m³",
      "avv": "AVV-Schlüssel",
      "classification": "z.B. Z0, 17 04 05, Bodenklasse X",
      "direction": "outbound",
      "notes": "Zusätzliche Infos"
    }
  ],
  "logistics_relevance": "Kurze Einschätzung ob Transportbedarf für N1C Logistics",
  "steel_producer_relevance": "Kurze Einschätzung ob Schrottmaterial für N1C Stahlproduzenten",
  "recommended_action": "MATCH" | "MONITOR" | "SKIP",
  "tags": ["tag1", "tag2"]
}

HIGH = klare, quantifizierte Materialströme mit Dispositionsfreiheit beim AN
MEDIUM = mögliche Ströme, aber unklare Mengen oder Disposition
LOW = keine relevanten Ströme für Kreislaufwirtschaft`;

  const userPrompt = `Ausschreibung analysieren:

Titel: ${tender.title}
Quelle: ${tender.source}
Auftraggeber: ${tender.contracting_authority}
Standort: ${tender.location.label}
CPV-Codes: ${tender.cpv.join(", ")}
Beschreibung: ${tender.description}
LV-Auszug: ${tender.raw_text || "nicht verfügbar"}
Auftragswert: ${tender.value_eur ? `${tender.value_eur.toLocaleString("de-DE")} €` : "unbekannt"}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.map(b => b.text || "").join("") || "";
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return { n1c_relevance: "LOW", relevance_reason: "Analyse fehlgeschlagen", material_flows: [], recommended_action: "SKIP", tags: [] };
  }
}

// ─── Components ──────────────────────────────────────────────────────────────

function SourceBadge({ source }) {
  const cfg = SOURCE_CONFIG[source] || { color: "#666", label: source };
  return (
    <span style={{
      background: cfg.color + "18",
      color: cfg.color,
      border: `1px solid ${cfg.color}40`,
      borderRadius: 4,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.04em",
      fontFamily: "monospace",
    }}>{cfg.label}</span>
  );
}

function RelevanceBadge({ level }) {
  if (!level) return <span style={{ color: "#9CA3AF", fontSize: 12 }}>–</span>;
  const cfg = RELEVANCE_CONFIG[level] || RELEVANCE_CONFIG.LOW;
  return (
    <span style={{
      background: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.color}30`,
      borderRadius: 4,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 700,
    }}>{cfg.label}</span>
  );
}

function MaterialFlowChip({ flow }) {
  const colors = {
    "Stahlschrott": { bg: "#FEF2F2", border: "#FECACA", text: "#DC2626" },
    "Erdaushub": { bg: "#FFFBEB", border: "#FDE68A", text: "#B45309" },
    "Betonabbruch": { bg: "#EFF6FF", border: "#BFDBFE", text: "#1D4ED8" },
    "Sonstiges": { bg: "#F9FAFB", border: "#E5E7EB", text: "#374151" },
  };
  const c = colors[flow.type] || colors["Sonstiges"];
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 6, padding: "4px 10px", display: "inline-flex",
      alignItems: "center", gap: 6, fontSize: 12,
    }}>
      <span style={{ color: c.text, fontWeight: 700 }}>{flow.type}</span>
      <span style={{ color: "#374151" }}>{flow.quantity}</span>
      <span style={{ color: "#9CA3AF", fontFamily: "monospace", fontSize: 10 }}>{flow.avv}</span>
    </div>
  );
}

function TenderCard({ tender, onAnalyze, onSelect, isSelected, analyzing }) {
  return (
    <div
      onClick={() => onSelect(tender)}
      style={{
        background: isSelected ? "#F0F9FF" : "#fff",
        border: `1.5px solid ${isSelected ? "#0EA5E9" : "#E5E7EB"}`,
        borderRadius: 10,
        padding: "16px 20px",
        cursor: "pointer",
        transition: "all 0.15s ease",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
            <SourceBadge source={tender.source} />
            <span style={{ color: "#9CA3AF", fontSize: 11, fontFamily: "monospace" }}>{tender.id}</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", lineHeight: 1.4, marginBottom: 4 }}>
            {tender.title}
          </div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            {tender.contracting_authority} · {tender.location.label}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <RelevanceBadge level={tender.n1c_relevance} />
          {tender.value_eur && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>
              {(tender.value_eur / 1000).toFixed(0)}k €
            </span>
          )}
        </div>
      </div>

      {tender.material_flows && tender.material_flows.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {tender.material_flows.map((f, i) => <MaterialFlowChip key={i} flow={f} />)}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <div style={{ fontSize: 11, color: "#9CA3AF" }}>
          Frist: <span style={{ color: "#374151", fontWeight: 600 }}>{tender.deadline}</span>
        </div>
        {tender.status === "unprocessed" && (
          <button
            onClick={(e) => { e.stopPropagation(); onAnalyze(tender.id); }}
            disabled={analyzing}
            style={{
              background: analyzing ? "#E5E7EB" : "#111827",
              color: analyzing ? "#9CA3AF" : "#fff",
              border: "none",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: analyzing ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {analyzing ? "⏳ Analyse…" : "⚡ KI-Analyse"}
          </button>
        )}
        {tender.status === "analyzed" && (
          <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 600 }}>✓ Analysiert</span>
        )}
      </div>
    </div>
  );
}

function DetailPanel({ tender, onClose }) {
  if (!tender) return null;

  const exportJSON = () => {
    const payload = {
      source_id: tender.id,
      source_platform: tender.source,
      title: tender.title,
      contracting_authority: tender.contracting_authority,
      location: tender.location,
      deadline: tender.deadline,
      value_eur: tender.value_eur,
      cpv_codes: tender.cpv,
      n1c_relevance: tender.n1c_relevance,
      material_flows: tender.material_flows || [],
      recommended_action: tender.recommended_action,
      tags: tender.tags || [],
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `n1c_tender_${tender.id}.json`;
    a.click();
  };

  return (
    <div style={{
      background: "#fff",
      border: "1.5px solid #E5E7EB",
      borderRadius: 12,
      padding: 24,
      position: "sticky",
      top: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <SourceBadge source={tender.source} />
            <RelevanceBadge level={tender.n1c_relevance} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#111827", lineHeight: 1.4 }}>{tender.title}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9CA3AF", padding: 0 }}>✕</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          ["Auftraggeber", tender.contracting_authority],
          ["Standort", tender.location.label],
          ["Frist", tender.deadline],
          ["Wert", tender.value_eur ? `${tender.value_eur.toLocaleString("de-DE")} €` : "–"],
        ].map(([k, v]) => (
          <div key={k} style={{ background: "#F9FAFB", borderRadius: 6, padding: "8px 12px" }}>
            <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{k}</div>
            <div style={{ fontSize: 13, color: "#111827", fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>CPV-Codes</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {tender.cpv.map(c => (
            <span key={c} style={{ background: "#F3F4F6", color: "#374151", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: "monospace" }}>{c}</span>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Beschreibung</div>
        <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{tender.description}</div>
      </div>

      {tender.material_flows && tender.material_flows.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Materialströme</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tender.material_flows.map((f, i) => (
              <div key={i} style={{ background: "#F9FAFB", borderRadius: 8, padding: "10px 14px", border: "1px solid #E5E7EB" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{f.type}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{f.quantity}</span>
                </div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>
                  AVV {f.avv} · {f.classification}
                  {f.notes && <span> · {f.notes}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tender.relevance_reason && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#B45309", fontWeight: 700, marginBottom: 4 }}>KI-Bewertung</div>
          <div style={{ fontSize: 13, color: "#374151" }}>{tender.relevance_reason}</div>
          {tender.logistics_relevance && (
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>🚛 {tender.logistics_relevance}</div>
          )}
          {tender.steel_producer_relevance && (
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>🏭 {tender.steel_producer_relevance}</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          onClick={exportJSON}
          style={{
            flex: 1,
            background: "#111827",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 0",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ↓ JSON Export
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tenders, setTenders] = useState(MOCK_TENDERS);
  const [analyzing, setAnalyzing] = useState({});
  const [selectedTender, setSelectedTender] = useState(null);
  const [filterSource, setFilterSource] = useState("ALL");
  const [filterRelevance, setFilterRelevance] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [searchText, setSearchText] = useState("");
  const [analyzeAll, setAnalyzeAll] = useState(false);

  const handleAnalyze = useCallback(async (id) => {
    const tender = tenders.find(t => t.id === id);
    if (!tender) return;

    setAnalyzing(prev => ({ ...prev, [id]: true }));
    try {
      const result = await analyzeTenderWithClaude(tender);
      setTenders(prev => prev.map(t =>
        t.id === id
          ? {
              ...t,
              status: "analyzed",
              n1c_relevance: result.n1c_relevance,
              material_flows: result.material_flows,
              relevance_reason: result.relevance_reason,
              logistics_relevance: result.logistics_relevance,
              steel_producer_relevance: result.steel_producer_relevance,
              recommended_action: result.recommended_action,
              tags: result.tags,
            }
          : t
      ));
      if (selectedTender?.id === id) {
        setSelectedTender(prev => ({
          ...prev,
          status: "analyzed",
          n1c_relevance: result.n1c_relevance,
          material_flows: result.material_flows,
          relevance_reason: result.relevance_reason,
          logistics_relevance: result.logistics_relevance,
          steel_producer_relevance: result.steel_producer_relevance,
          recommended_action: result.recommended_action,
          tags: result.tags,
        }));
      }
    } catch (e) {
      console.error(e);
    }
    setAnalyzing(prev => ({ ...prev, [id]: false }));
  }, [tenders, selectedTender]);

  const handleAnalyzeAll = async () => {
    setAnalyzeAll(true);
    const unprocessed = tenders.filter(t => t.status === "unprocessed");
    for (const t of unprocessed) {
      await handleAnalyze(t.id);
    }
    setAnalyzeAll(false);
  };

  const exportAllCSV = () => {
    const analyzed = tenders.filter(t => t.status === "analyzed");
    const header = ["ID", "Quelle", "Titel", "Auftraggeber", "Standort", "Deadline", "Wert (€)", "Relevanz", "Materialströme", "Empfehlung"];
    const rows = analyzed.map(t => [
      t.id, t.source, t.title, t.contracting_authority, t.location.label,
      t.deadline, t.value_eur || "",
      t.n1c_relevance || "",
      (t.material_flows || []).map(f => `${f.type} ${f.quantity}`).join("; "),
      t.recommended_action || "",
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `n1c_ausschreibungen_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const filtered = tenders.filter(t => {
    if (filterSource !== "ALL" && t.source !== filterSource) return false;
    if (filterRelevance !== "ALL" && t.n1c_relevance !== filterRelevance) return false;
    if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
    if (searchText && !t.title.toLowerCase().includes(searchText.toLowerCase()) && !t.contracting_authority.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: tenders.length,
    analyzed: tenders.filter(t => t.status === "analyzed").length,
    high: tenders.filter(t => t.n1c_relevance === "HIGH").length,
    totalSteel: tenders.flatMap(t => t.material_flows || [])
      .filter(f => f.type === "Stahlschrott")
      .reduce((sum, f) => sum + (f.quantity_numeric || 0), 0),
  };

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      background: "#F8FAFC",
      minHeight: "100vh",
      color: "#111827",
    }}>
      {/* Header */}
      <div style={{
        background: "#0C1117",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 56,
        borderBottom: "1px solid #1F2937",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28,
              background: "linear-gradient(135deg, #22D3EE, #0EA5E9)",
              borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 900, color: "#fff",
            }}>N</div>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>N1C Circular</span>
          </div>
          <span style={{ color: "#4B5563", fontSize: 13 }}>›</span>
          <span style={{ color: "#9CA3AF", fontSize: 13 }}>Ausschreibungs-Monitor</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={exportAllCSV}
            style={{ background: "#1F2937", color: "#D1D5DB", border: "1px solid #374151", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
          >
            ↓ CSV Export
          </button>
          <button
            onClick={handleAnalyzeAll}
            disabled={analyzeAll || tenders.filter(t => t.status === "unprocessed").length === 0}
            style={{
              background: analyzeAll ? "#374151" : "#0EA5E9",
              color: "#fff", border: "none", borderRadius: 6,
              padding: "5px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700,
            }}
          >
            {analyzeAll ? "⏳ Analysiere…" : `⚡ Alle analysieren (${tenders.filter(t => t.status === "unprocessed").length})`}
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "12px 24px" }}>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          {[
            ["Ausschreibungen gesamt", stats.total, ""],
            ["Analysiert", stats.analyzed, ""],
            ["Hohe Relevanz", stats.high, ""],
            ["Stahlschrott identifiziert", stats.totalSteel ? `${stats.totalSteel} t` : "–", ""],
          ].map(([label, val, unit]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.03em" }}>{val}{unit}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ display: "grid", gridTemplateColumns: selectedTender ? "1fr 380px" : "1fr", gap: 0, maxWidth: 1400, margin: "0 auto", padding: 24 }}>
        {/* Left: List */}
        <div style={{ paddingRight: selectedTender ? 24 : 0 }}>
          {/* Filters */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input
              placeholder="Suche nach Titel, Auftraggeber…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{
                flex: "1 1 220px", background: "#fff", border: "1.5px solid #E5E7EB",
                borderRadius: 8, padding: "7px 12px", fontSize: 13, color: "#111827",
                outline: "none",
              }}
            />
            {[
              { label: "Quelle", value: filterSource, setter: setFilterSource, opts: [["ALL", "Alle Quellen"], ...Object.keys(SOURCE_CONFIG).map(k => [k, SOURCE_CONFIG[k].label])] },
              { label: "Relevanz", value: filterRelevance, setter: setFilterRelevance, opts: [["ALL", "Alle"], ["HIGH", "Hoch"], ["MEDIUM", "Mittel"], ["LOW", "Niedrig"]] },
              { label: "Status", value: filterStatus, setter: setFilterStatus, opts: [["ALL", "Alle"], ["analyzed", "Analysiert"], ["unprocessed", "Offen"]] },
            ].map(({ label, value, setter, opts }) => (
              <select
                key={label}
                value={value}
                onChange={e => setter(e.target.value)}
                style={{
                  background: "#fff", border: "1.5px solid #E5E7EB",
                  borderRadius: 8, padding: "7px 10px", fontSize: 13,
                  color: "#111827", cursor: "pointer", outline: "none",
                }}
              >
                {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>{filtered.length} Ergebnisse</span>
          </div>

          {/* Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "#9CA3AF" }}>Keine Ausschreibungen gefunden.</div>
            ) : filtered.map(t => (
              <TenderCard
                key={t.id}
                tender={t}
                onAnalyze={handleAnalyze}
                onSelect={setSelectedTender}
                isSelected={selectedTender?.id === t.id}
                analyzing={!!analyzing[t.id]}
              />
            ))}
          </div>

          {/* Info note */}
          <div style={{
            marginTop: 24, padding: "12px 16px",
            background: "#EFF6FF", border: "1px solid #BFDBFE",
            borderRadius: 8, fontSize: 12, color: "#1D4ED8",
          }}>
            <strong>Demo-Modus:</strong> Enthält Beispiel-Ausschreibungen. In der Produktionsversion werden vergabe.autobahn.de, TED API, DTVP und evergabe.de live abgefragt. Klicke auf „⚡ KI-Analyse" um Claude das LV analysieren zu lassen und Materialströme zu identifizieren.
          </div>
        </div>

        {/* Right: Detail Panel */}
        {selectedTender && (
          <div>
            <DetailPanel
              tender={selectedTender}
              onClose={() => setSelectedTender(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
