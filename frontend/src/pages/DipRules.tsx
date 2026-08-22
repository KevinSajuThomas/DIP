import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function DipRules() {
  const [instruments, setInstruments] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [thresholds, setThresholds] = useState<Array<{ percent: number }>>([]);
  const [pendingEvents, setPendingEvents] = useState<any[]>([]);
  const [simSymbol, setSimSymbol] = useState("");
  const [simPrice, setSimPrice] = useState("");
  const [simResult, setSimResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPending = () =>
    api.getThresholdEvents().then((events) =>
      setPendingEvents(events.filter((e: any) => e.status === "ACTION_PENDING"))
    );

  useEffect(() => {
    api.getInstruments().then((ins) => {
      setInstruments(ins);
      if (ins[0]) {
        setSelectedId(ins[0].id);
        setThresholds(ins[0].thresholds.map((t: any) => ({ percent: Number(t.percent) })));
        setSimSymbol(ins[0].symbol);
      }
    });
    loadPending();
  }, []);

  const selectInstrument = (id: string) => {
    setSelectedId(id);
    const inst = instruments.find((i) => i.id === id);
    if (inst) {
      setThresholds(inst.thresholds.map((t: any) => ({ percent: Number(t.percent) })));
      setSimSymbol(inst.symbol);
    }
  };

  const updateThreshold = (idx: number, value: string) => {
    const next = [...thresholds];
    next[idx] = { percent: Number(value) };
    setThresholds(next);
  };

  const save = async () => {
    try {
      await api.setThresholds(selectedId, thresholds);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runSimulation = async () => {
    try {
      await api.setSimulatedPrice(simSymbol, Number(simPrice));
      const status = await api.getInstrumentStatus(selectedId);
      setSimResult(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const resolve = async (id: string, action: "CONFIRM" | "SKIP" | "DEFER") => {
    try {
      await api.resolveThresholdEvent(id, action);
      loadPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="main">
      <h2>Dip Rules</h2>

      {pendingEvents.length > 0 && (
        <div className="card" style={{ borderColor: "#f59e0b" }}>
          <h3>Action required</h3>
          {pendingEvents.map((e) => (
            <div key={e.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #23262b" }}>
              <div>DIP OPPORTUNITY</div>
              <div>Drawdown: {Number(e.drawdownPercent).toFixed(2)}%</div>
              <div>Threshold reached: -{Number(e.thresholdPercent)}%</div>
              <div>Calculated deployment: Rs {Number(e.calculatedDeployment).toLocaleString("en-IN")}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => resolve(e.id, "CONFIRM")}>Confirm investment</button>
                <button className="btn secondary" onClick={() => resolve(e.id, "SKIP")}>Skip</button>
                <button className="btn secondary" onClick={() => resolve(e.id, "DEFER")}>Defer</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <p style={{ color: "#9aa1ab", fontSize: 13 }}>
          Market thresholds are gates only — they determine whether the dip mechanism activates.
          The deployment amount is always calculated as Rs multiplier × months since the last dip
          deployment, capped by available reserve. Editing thresholds here does not change deployment amounts.
        </p>
        <select value={selectedId} onChange={(e) => selectInstrument(e.target.value)}>
          {instruments.map((i) => <option key={i.id} value={i.id}>{i.displayName}</option>)}
        </select>

        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Threshold %</th></tr></thead>
          <tbody>
            {thresholds.map((t, idx) => (
              <tr key={idx}>
                <td><input value={t.percent} onChange={(e) => updateThreshold(idx, e.target.value)} style={{ width: 60 }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button style={{ marginTop: 8 }} onClick={save} className="btn">Save thresholds</button>
      </div>

      <div className="card">
        <h3>Simulation mode</h3>
        <p style={{ color: "#9aa1ab", fontSize: 13 }}>
          Requires SIMULATION_MODE=true on the backend. Never sends a real WhatsApp message unless
          WhatsApp alerts are separately enabled.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="Symbol" value={simSymbol} onChange={(e) => setSimSymbol(e.target.value)} />
          <input placeholder="Simulated price" value={simPrice} onChange={(e) => setSimPrice(e.target.value)} />
          <button onClick={runSimulation} className="btn">Evaluate</button>
        </div>
        {simResult && (
          <div style={{ marginTop: 12 }}>
            <div>Drawdown: {simResult.evaluation.drawdownPercent.toFixed(2)}%</div>
            <div>Classification: <span className={`badge ${simResult.evaluation.classification.label}`}>{simResult.evaluation.classification.label}</span></div>
            <div>Newly triggered: {simResult.evaluation.newlyTriggered.map((t: any) => `-${t.percent}%`).join(", ") || "none"}</div>
            <div>Deepest triggered: {simResult.evaluation.deepestNewlyTriggeredPercent !== null ? `-${simResult.evaluation.deepestNewlyTriggeredPercent}%` : "none"}</div>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
