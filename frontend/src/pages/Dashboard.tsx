import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Dashboard() {
  const [strategy, setStrategy] = useState<any>(null);
  const [reserve, setReserve] = useState<any>(null);
  const [instruments, setInstruments] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, any>>({});
  const [pendingEvents, setPendingEvents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.getStrategy(),
      api.getReserveLedger(),
      api.getInstruments(),
      api.getThresholdEvents(),
    ])
      .then(async ([s, r, ins, events]) => {
        setStrategy(s);
        setReserve(r);
        setInstruments(ins);
        setPendingEvents(events.filter((e: any) => e.status === "ACTION_PENDING"));
        const entries = await Promise.all(
          ins.map(async (i: any) => {
            try {
              return [i.id, await api.getInstrumentStatus(i.id)];
            } catch {
              return [i.id, null];
            }
          })
        );
        setStatuses(Object.fromEntries(entries));
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="main"><div className="error">{error}</div></div>;
  if (!strategy) return <div className="main">Loading...</div>;

  const settings = strategy.settings;
  const reserveBalance = reserve?.balance ?? 0;
  const reservePct = settings ? Math.min((reserveBalance / Number(settings.maxReserve)) * 100, 100) : 0;

  return (
    <div className="main">
      <h2>Dashboard</h2>

      {pendingEvents.length > 0 && (
        <div className="card" style={{ borderColor: "#f59e0b" }}>
          <h3>Next Action</h3>
          {pendingEvents.map((e) => (
            <div key={e.id} style={{ marginBottom: 8 }}>
              Dip threshold reached: <strong>-{Number(e.thresholdPercent)}%</strong>
              {" — "}Calculated deployment: <strong>Rs {Number(e.calculatedDeployment).toLocaleString("en-IN")}</strong>
              {" "}<a href="/rules">Review and confirm →</a>
            </div>
          ))}
        </div>
      )}
      {pendingEvents.length === 0 && (
        <div className="card"><p style={{ color: "#9aa1ab" }}>No dip currently active.</p></div>
      )}

      <div className="card">
        <h3>Monthly Plan</h3>
        <div className="grid">
          <div>Monthly budget<br /><strong>Rs {Number(settings?.monthlyBudget ?? 0).toLocaleString("en-IN")}</strong></div>
          <div>Normal investment<br /><strong>Rs {Number(settings?.normalInvestment ?? 0).toLocaleString("en-IN")}</strong></div>
          <div>Reserve contribution<br /><strong>Rs {Number(settings?.reserveContribution ?? 0).toLocaleString("en-IN")}</strong></div>
        </div>
      </div>

      <div className="card">
        <h3>Reserve</h3>
        <div>Rs {reserveBalance.toLocaleString("en-IN")} / Rs {Number(settings?.maxReserve ?? 0).toLocaleString("en-IN")}</div>
        <div style={{ background: "#23262b", borderRadius: 4, height: 8, marginTop: 6, overflow: "hidden" }}>
          <div style={{ background: "#2563eb", width: `${reservePct}%`, height: "100%" }} />
        </div>
      </div>

      <div className="card">
        <h3>Strategy — {instruments[0]?.displayName ?? "No primary instrument set"}</h3>
        <table>
          <thead>
            <tr>
              <th>Index</th><th>Current</th><th>Ref High</th><th>Drawdown</th>
              <th>Status</th><th>Next threshold</th><th>Next trigger</th>
            </tr>
          </thead>
          <tbody>
            {instruments.map((i) => {
              const st = statuses[i.id];
              const ev = st?.evaluation;
              return (
                <tr key={i.id}>
                  <td>{i.displayName}</td>
                  <td>{st ? `Rs ${st.quote.price.toLocaleString("en-IN")}` : "—"}</td>
                  <td>{ev ? `Rs ${ev.referenceHigh.toLocaleString("en-IN")}` : "—"}</td>
                  <td>{ev ? `${ev.drawdownPercent.toFixed(2)}%` : "—"}</td>
                  <td>{ev && <span className={`badge ${ev.classification.label}`}>{ev.classification.label.replace(/_/g, " ")}</span>}</td>
                  <td>{ev?.nextThreshold ? `-${ev.nextThreshold.percent}%` : "—"}</td>
                  <td>{ev?.nextTriggerPrice ? `Rs ${ev.nextTriggerPrice.toLocaleString("en-IN")}` : "—"}</td>
                </tr>
              );
            })}
            {instruments.length === 0 && (
              <tr><td colSpan={7} style={{ color: "#9aa1ab" }}>No instruments added yet. Add one under Market Monitor.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="disclaimer">
        DipBuy is a personal investment tracking and decision-support tool. Historical results do
        not guarantee future returns. Market drawdowns can persist or become deeper. No investment
        outcome is guaranteed.
      </p>
    </div>
  );
}
