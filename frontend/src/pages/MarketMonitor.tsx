import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Card, StatusBadge, EmptyState, ChangeIndicator } from "../components/ui.js";
import { formatINR } from "../lib/format.js";

export default function MarketMonitor() {
  const [strategy, setStrategy] = useState<any>(null);
  const [instruments, setInstruments] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, any>>({});
  const [showForm, setShowForm] = useState(false);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ symbol: string; name: string; exchange: string } | null>(null);
  const [initialHigh, setInitialHigh] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const onQueryChange = (value: string) => {
    setQuery(value);
    setPicked(null);
    setSearchError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.searchSymbols(value);
        setSearchResults(results.slice(0, 8));
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : String(e));
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const addInstrument = async () => {
    if (!picked) return;
    try {
      const isCore = /NIFTY\s?(50|100|200|500)\b/i.test(picked.name) || /NIFTY\s?(50|100|200|500)\b/i.test(picked.symbol);
      await api.createInstrument({
        symbol: picked.symbol,
        displayName: picked.name,
        category: isCore ? "CORE_BROAD_MARKET" : "SECTOR_SEGMENT",
        initialReferenceHigh: Number(initialHigh),
        useDefaultThresholds: true,
      });
      setInitialHigh("");
      setPicked(null);
      setQuery("");
      setShowForm(false);
      showToast(`${picked.name} added`);
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

  const removeInstrument = async (instrumentId: string, name: string) => {
    if (!confirm(`Remove ${name}? This deletes its price history, thresholds, and alert history too.`)) return;
    try {
      await api.deleteInstrument(instrumentId);
      showToast(`${name} removed`);
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
            description="Search for NIFTY 50 to start monitoring drawdowns and running the DipBuy strategy."
            action={<button className="btn" onClick={() => setShowForm(true)}>Add an instrument</button>}
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
          <div style={{ marginBottom: 12 }}>
            <div style={{ position: "relative", maxWidth: 360 }}>
              <input
                placeholder="Search e.g. Nifty 50"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                style={{ width: "100%" }}
              />
              {query.trim().length >= 2 && !picked && (
                <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: "auto", position: "absolute", width: "100%", zIndex: 10 }}>
                  {searching && <div style={{ padding: 10, fontSize: 12.5, color: "var(--text-muted)" }}>Searching…</div>}
                  {searchError && <div style={{ padding: 10, fontSize: 12.5, color: "var(--negative)" }}>{searchError}</div>}
                  {!searching && !searchError && searchResults.length === 0 && (
                    <div style={{ padding: 10, fontSize: 12.5, color: "var(--text-muted)" }}>No matches</div>
                  )}
                  {searchResults.map((r) => (
                    <div
                      key={`${r.symbol}-${r.exchange}`}
                      onClick={() => { setPicked(r); setQuery(`${r.name} (${r.symbol})`); setSearchResults([]); }}
                      style={{ padding: "8px 10px", cursor: "pointer", fontSize: 13 }}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 11.5 }}>{r.symbol} · {r.exchange}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {picked && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                <input placeholder="Reference high (₹)" value={initialHigh} onChange={(e) => setInitialHigh(e.target.value)} />
                <button className="btn" onClick={addInstrument} disabled={!initialHigh}>
                  Add {picked.name}
                </button>
              </div>
            )}
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
                      {" "}
                      <button className="btn ghost sm" onClick={() => removeInstrument(i.id, i.displayName)} title="Remove">
                        Remove
                      </button>
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
