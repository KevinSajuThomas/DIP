import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, MetricCard, StatusBadge, ProgressBar, EmptyState, ChangeIndicator } from "../components/ui.js";
import { formatINR, formatPercent } from "../lib/format.js";
import { PriceChart, DrawdownChart } from "../components/charts.js";

export default function Dashboard() {
  const [strategy, setStrategy] = useState<any>(null);
  const [reserve, setReserve] = useState<any>(null);
  const [instruments, setInstruments] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, any>>({});
  const [pendingEvents, setPendingEvents] = useState<any[]>([]);
  const [priceHistory, setPriceHistory] = useState<Array<{ date: string; close: number }>>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getStrategy(), api.getReserveLedger(), api.getInstruments(), api.getThresholdEvents()])
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
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Every hook must run unconditionally on every render (Rules of Hooks) —
  // this must sit above the early `return`s below, not after them, or React
  // sees a different hook count between the loading and loaded renders and
  // throws "Rendered more hooks than during the previous render".
  const primaryInstrumentForEffect = instruments.find((i) => i.primaryForStrategyId) ?? null;
  useEffect(() => {
    if (!primaryInstrumentForEffect) return;
    api
      .getMarketHistory(primaryInstrumentForEffect.symbol, 180)
      .then(setPriceHistory)
      .catch((e) => setHistoryError(e instanceof Error ? e.message : String(e)));
  }, [primaryInstrumentForEffect?.symbol]);

  if (error) return <div className="main"><div className="error">{error}</div></div>;
  if (loading || !strategy) return <div className="main"><Card><div style={{ height: 120 }} /></Card></div>;

  const settings = strategy.settings;
  const reserveBalance = reserve?.balance ?? 0;
  const maxReserve = Number(settings?.maxReserve ?? 15000);
  const reservePct = maxReserve ? Math.min((reserveBalance / maxReserve) * 100, 100) : 0;
  const capReached = reserveBalance >= maxReserve;

  const primaryInstrument = primaryInstrumentForEffect;
  const primaryStatus = primaryInstrument ? statuses[primaryInstrument.id] : null;
  const primaryEval = primaryStatus?.evaluation;

  const normalInvestment = Number(settings?.normalInvestment ?? 0);
  const reserveContribution = Number(settings?.reserveContribution ?? 0);
  const monthlyBudget = Number(settings?.monthlyBudget ?? 0);
  const normalPct = monthlyBudget ? (normalInvestment / monthlyBudget) * 100 : 0;

  const activeDip = pendingEvents[0];

  return (
    <div className="main">
      {/* Hero / Next Action card */}
      {activeDip ? (
        <Card className="card-hero state-dip">
          <div className="card-hero-eyebrow dip">Dip threshold reached</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div className="metric-label">{primaryInstrument?.displayName ?? "Primary market"}</div>
              <div className="metric-value lg">-{Number(activeDip.thresholdPercent)}%</div>
              <div className="metric-sub">Drawdown {formatPercent(Number(activeDip.drawdownPercent))}</div>
            </div>
            <div>
              <div className="metric-label">Calculated deployment</div>
              <div className="metric-value lg">{formatINR(Number(activeDip.calculatedDeployment))}</div>
            </div>
            <StatusBadge label="ACTION PENDING" className="MAJOR_CORRECTION" />
          </div>
        </Card>
      ) : capReached ? (
        <Card className="card-hero state-cap">
          <div className="card-hero-eyebrow cap">Reserve cap reached</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
            <MetricCard label="Reserve" value={formatINR(reserveBalance)} size="lg" />
            <MetricCard label="Release available" value={formatINR(Number(settings?.capRelease ?? 0))} size="lg" />
          </div>
        </Card>
      ) : (
        <Card className="card-hero state-normal">
          <div className="card-hero-eyebrow">Normal market</div>
          {primaryEval ? (
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
              <MetricCard label={primaryInstrument.displayName} value={formatINR(primaryEval.currentPrice)} size="lg" />
              <MetricCard label="Reference high" value={formatINR(primaryEval.referenceHigh)} />
              <MetricCard
                label="Drawdown"
                value={formatPercent(primaryEval.drawdownPercent)}
                tone={primaryEval.drawdownPercent < 0 ? "negative" : undefined}
              />
              <MetricCard
                label="Next threshold"
                value={primaryEval.nextThreshold ? `-${primaryEval.nextThreshold.percent}%` : "—"}
                sub={
                  primaryEval.nextTriggerPrice
                    ? `${formatINR(primaryEval.nextTriggerPrice)} · distance ${formatPercent(
                        primaryEval.drawdownPercent - -primaryEval.nextThreshold.percent
                      )}`
                    : undefined
                }
              />
            </div>
          ) : (
            <EmptyState
              title="Set up your first market"
              description="Add NIFTY 50 and make it your primary strategy instrument to start tracking dips."
              action={<a href="/market"><button className="btn">Add NIFTY 50</button></a>}
            />
          )}
          {primaryEval && <div className="metric-sub" style={{ marginTop: 4 }}>No dip action required.</div>}
        </Card>
      )}

      <div className="grid-2">
        {/* Monthly plan */}
        <Card title="Monthly plan">
          <MetricCard label="Total budget" value={formatINR(monthlyBudget)} size="lg" />
          <div className="allocation-bar">
            <div className="seg-normal" style={{ width: `${normalPct}%` }} />
            <div className="seg-reserve" style={{ width: `${100 - normalPct}%` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
            <span><span style={{ color: "var(--accent)" }}>●</span> {formatINR(normalInvestment)} normal</span>
            <span><span style={{ color: "var(--text-secondary)" }}>●</span> {formatINR(reserveContribution)} reserve</span>
          </div>
          <p className="disclaimer">
            This is one {formatINR(monthlyBudget)} monthly budget. The reserve is delayed investment, not additional money.
          </p>
        </Card>

        {/* Reserve */}
        <Card title="Dip reserve">
          <MetricCard label="Current reserve" value={formatINR(reserveBalance)} size="lg" sub={`of ${formatINR(maxReserve)} maximum`} />
          <div style={{ marginTop: 10 }}>
            <ProgressBar percent={reservePct} warning={capReached} />
            <div className="metric-sub" style={{ marginTop: 6 }}>{reservePct.toFixed(0)}% of maximum reserve</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <StatusBadge
              label={capReached ? "RESERVE CAP REACHED" : "ACCUMULATING"}
              className={capReached ? "MAJOR_CORRECTION" : "NORMAL"}
            />
          </div>
        </Card>
      </div>

      {/* Threshold ladder */}
      {primaryEval && (
        <Card title="Market dip levels">
          {[3, 5, 8, 10, 15, 20].map((pct) => {
            const triggered = primaryEval.alreadyTriggered?.includes(pct) || (activeDip && Number(activeDip.thresholdPercent) === pct);
            const triggerPrice = primaryEval.referenceHigh * (1 - pct / 100);
            return (
              <div key={pct} className={`ladder-row ${triggered ? "triggered" : ""}`}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>-{pct}%</span>
                <span className="num" style={{ color: "var(--text-secondary)", fontSize: 13 }}>{formatINR(triggerPrice)}</span>
                <StatusBadge label={triggered ? "TRIGGERED" : "WAITING"} className={triggered ? "TRIGGERED" : "WAITING"} />
              </div>
            );
          })}
        </Card>
      )}

      {/* Price + drawdown charts */}
      {primaryInstrument && (
        <div className="grid-2">
          <Card title={`${primaryInstrument.displayName} price (180d)`}>
            {historyError ? (
              <div className="error">{historyError}</div>
            ) : (
              <PriceChart data={priceHistory} referenceHigh={primaryEval?.referenceHigh ?? 0} />
            )}
          </Card>
          <Card title="Drawdown from high">
            {!historyError && <DrawdownChart data={priceHistory} referenceHigh={primaryEval?.referenceHigh ?? 0} />}
          </Card>
        </div>
      )}

      {/* Market overview */}
      <Card title="Market overview">
        {instruments.length === 0 ? (
          <EmptyState
            title="No markets added"
            description="Add NIFTY 50 to start monitoring your strategy."
            action={<a href="/market"><button className="btn">Add NIFTY 50</button></a>}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Instrument</th><th>Current</th><th>From high</th><th>Status</th><th>Next dip</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((i) => {
                const st = statuses[i.id];
                const ev = st?.evaluation;
                return (
                  <tr key={i.id}>
                    <td>
                      {i.displayName}{" "}
                      {i.primaryForStrategyId && <StatusBadge label="PRIMARY" className="PRIMARY" />}
                    </td>
                    <td className="num">{st ? formatINR(st.quote.price) : "—"}</td>
                    <td>{ev ? <ChangeIndicator value={ev.drawdownPercent} withSign={false} /> : "—"}</td>
                    <td>{ev && <StatusBadge label={ev.classification.label.replace(/_/g, " ")} className={ev.classification.label} />}</td>
                    <td>{ev?.nextThreshold ? `-${ev.nextThreshold.percent}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <p className="disclaimer">
        DipBuy is a personal investment tracking and decision-support tool. Historical results do not guarantee
        future returns. Market drawdowns can persist or become deeper. No investment outcome is guaranteed.
      </p>
    </div>
  );
}
