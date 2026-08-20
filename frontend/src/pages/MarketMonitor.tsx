import { useEffect, useState } from "react";
import { api } from "../api.js";

const CORE = ["NIFTY 50", "NIFTY 100", "NIFTY 200", "NIFTY 500"];
const SECTOR = ["NIFTY Bank", "NIFTY IT", "NIFTY Auto", "NIFTY Pharma", "NIFTY FMCG", "NIFTY Midcap 150", "NIFTY Smallcap 250"];

export default function MarketMonitor() {
  const [instruments, setInstruments] = useState<any[]>([]);
  const [displayName, setDisplayName] = useState(CORE[0]);
  const [symbol, setSymbol] = useState("NIFTY50");
  const [initialHigh, setInitialHigh] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => api.getInstruments().then(setInstruments).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const addInstrument = async () => {
    try {
      await api.createInstrument({
        symbol,
        displayName,
        category: CORE.includes(displayName) ? "CORE_BROAD_MARKET" : "SECTOR_SEGMENT",
        referenceMode: "CURRENT_CYCLE_HIGH",
        initialReferenceHigh: Number(initialHigh),
        useDefaultThresholds: true,
      });
      setInitialHigh("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="main">
      <h2>Market Monitor</h2>

      <div className="card">
        <h3>Add instrument</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSymbol(e.target.value.replace(/\s+/g, ""));
            }}
          >
            <optgroup label="Core broad-market">
              {CORE.map((c) => <option key={c} value={c}>{c}</option>)}
            </optgroup>
            <optgroup label="Sector / segment">
              {SECTOR.map((c) => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          </select>
          <input
            placeholder="Reference high (₹)"
            value={initialHigh}
            onChange={(e) => setInitialHigh(e.target.value)}
          />
          <button onClick={addInstrument} disabled={!initialHigh}>Add</button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      <div className="grid">
        {instruments.map((i) => (
          <div className="card" key={i.id}>
            <strong>{i.displayName}</strong>
            <div style={{ fontSize: 12, color: "#9aa1ab" }}>{i.category.replace(/_/g, " ")}</div>
            <div style={{ marginTop: 8 }}>
              Reference high: ₹{Number(i.referenceCycles?.[0]?.referenceHigh ?? 0).toLocaleString("en-IN")}
            </div>
            <div>Mode: {i.referenceMode.replace(/_/g, " ")}</div>
            <div>{i.thresholds.length} thresholds configured</div>
          </div>
        ))}
      </div>
    </div>
  );
}
