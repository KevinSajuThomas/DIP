import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, StatusBadge, EmptyState, ChangeIndicator } from "../components/ui.js";
import { formatINR } from "../lib/format.js";

const CORE = ["NIFTY 50", "NIFTY 100", "NIFTY 200", "NIFTY 500"];
const SECTOR = ["NIFTY Bank", "NIFTY IT", "NIFTY Auto", "NIFTY Pharma", "NIFTY FMCG", "NIFTY Midcap 150", "NIFTY Smallcap 250"];

export default function MarketMonitor() {
  const [strategy, setStrategy] = useState<any>(null);
  const [instruments, setInstruments] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, any>>({});
  const [displayName, setDisplayName] = useState(CORE[0]);
  const [symbol, setSymbol] = useState("NIFTY50");
  const [initialHigh, setInitialHigh] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = () =>
    Promise.all([api.getStrategy(), api.getInstruments()]).then(async ([s, ins]) => {
      setStrategy(s);
      setInstruments(ins);
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
    });

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const addInstrument = async () => {
    try {
      await api.createInstrument({
        symbol,
        displayName,
        category: CORE.includes(displayName) ? "CORE_BROAD_MARKET" : "SECTOR_SEGMENT",
        initialReferenceHigh: Number(initialHigh),
        useDefaultThresholds: true,
      });
      setInitialHigh("");
      setShowForm(false);
      showToast(`${displayName} added`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const setPrimary = async (instrumentId: string, name: string) => {
    if (!strategy) return;
    if (!confirm(`Use ${name} as the primary DipBuy strategy instrument?`)) return;
    try {
      await api.setPrimaryInstrument(instrumentId, strategy.id);
      showToast(`${name} set as primary strategy market`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const hasPrimary = instruments.some((i) => i.primaryForStrategyId);

  return (
    <div className="main">
      {instruments.length === 0 ? (
        <Card>
          <EmptyState
            title="Set up your first market"
            description="Add NIFTY 50 to start monitoring drawdowns and running the DipBuy strategy."
            action={<button className="btn" onClick={() => setShowForm(true)}>Add NIFTY 50</button>}
          />
        </Card>
      ) : !hasPrimary ? (
        <Card className="card-hero state-dip">
          <div className="card-hero-eyebrow dip">Choose your primary strategy market</div>
          <p style={{ margin: "4px 0 12px", color: "var(--text-secondary)", fontSize: 13.5 }}>
            Only one instrument can spend the dip reserve. Pick which one below.
          </p>
        </Card>
      ) : null}

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showForm ? 14 : 0 }}>
          <h3 style={{ margin: 0 }}>Instruments</h3>
          <button className="btn secondary sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "+ Add instrument"}
          </button>
        </div>

        {showForm && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <select
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setSymbol(e.target.value.replace(/\s+/g, "")); }}
            >
              <optgroup label="Core broad-market">{CORE.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
              <optgroup label="Sector / segment">{SECTOR.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
            </select>
            <input placeholder="Reference high (₹)" value={initialHigh} onChange={(e) => setInitialHigh(e.target.value)} />
            <button className="btn" onClick={addInstrument} disabled={!initialHigh}>Add</button>
          </div>
        )}
        {error && <div className="error">{error}</div>}

        {instruments.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Instrument</th><th>Price</th><th>From high</th><th>Status</th><th>Next dip</th><th></th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((i) => {
                const st = statuses[i.id];
                const ev = st?.evaluation;
                const isPrimary = !!i.primaryForStrategyId;
                return (
                  <tr key={i.id}>
                    <td>{i.displayName}</td>
                    <td className="num">{st ? formatINR(st.quote.price) : "—"}</td>
                    <td>{ev ? <ChangeIndicator value={ev.drawdownPercent} withSign={false} /> : "—"}</td>
                    <td>{ev && <StatusBadge label={ev.classification.label.replace(/_/g, " ")} className={ev.classification.label} />}</td>
                    <td>{ev?.nextThreshold ? `-${ev.nextThreshold.percent}%` : "—"}</td>
                    <td>
                      {isPrimary ? (
                        <StatusBadge label="PRIMARY" className="PRIMARY" />
                      ) : (
                        <button className="btn secondary sm" onClick={() => setPrimary(i.id, i.displayName)}>
                          Set as primary
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
