import { useState } from "react";
import { api } from "../api.js";
import { Card } from "../components/ui.js";
import { formatINR } from "../lib/format.js";
import { BacktestComparisonChart } from "../components/charts.js";

export default function Backtesting() {
  const [symbol, setSymbol] = useState("NIFTY50");
  const [periodYears, setPeriodYears] = useState("10");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setError(null);
    setLoading(true);
    try {
      // No dipbuyConfig is sent — backend defaults to the authoritative
      // DEFAULT_STRATEGY_CONFIG (₹10k budget, ₹7k normal, ₹3k reserve,
      // ₹15k cap, ₹7k release, ₹500/month multiplier), so this backtest
      // runs the EXACT same engine as live monitoring, per PART 32.
      const res = await api.runBacktest({ symbol, periodYears: Number(periodYears) });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const baseline = result?.results?.[0];
  const dipbuy = result?.results?.[1];

  return (
    <div className="main">
      <Card>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 0 }}>
          Compares 100% normal SIP against the exact DipBuy strategy engine (same code the live
          worker uses) over historical prices, with no look-ahead bias.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          <select value={periodYears} onChange={(e) => setPeriodYears(e.target.value)}>
            <option value="5">5 years</option>
            <option value="10">10 years</option>
            <option value="15">15 years</option>
            <option value="20">20 years</option>
          </select>
          <button onClick={run} disabled={loading} className="btn">{loading ? "Running…" : "Run backtest"}</button>
        </div>
        {error && (
          <div className="error" style={{ marginTop: 8 }}>
            {error}
            <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
              Requires a configured market-data provider with historical data for this symbol,
              or pass priceHistory directly via the API. Use the symbol search on Markets to find
              a valid ticker first.
            </div>
          </div>
        )}
      </Card>

      {result && (
        <>
          <Card title={`Results — ${symbol}, ${periodYears} years`}>
            <table>
              <thead>
                <tr>
                  <th>Strategy</th><th>Invested</th><th>Final value</th><th>Profit</th>
                  <th>CAGR</th><th>XIRR</th><th>Max DD</th><th>Dip events</th><th>Cap events</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r: any) => (
                  <tr key={r.strategyName}>
                    <td>{r.strategyName}</td>
                    <td className="num">{formatINR(r.totalActuallyInvested)}</td>
                    <td className="num">{formatINR(r.finalPortfolioValue)}</td>
                    <td className="num">{formatINR(r.absoluteProfit)}</td>
                    <td className="num">{r.cagrPercent}%</td>
                    <td className="num">{r.xirrPercent}%</td>
                    <td className="num">{r.maxDrawdownPercent}%</td>
                    <td className="num">{r.dipDeploymentCount}</td>
                    <td className="num">{r.capDeploymentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 10, fontSize: 13.5, color: result.comparison.outperformed ? "var(--positive)" : "var(--negative)" }}>
              {result.comparison.outperformed ? "DipBuy outperformed" : "DipBuy underperformed"} the 100% SIP baseline
              by {formatINR(result.comparison.valueDifference)} ({result.comparison.outperformancePercent}%).
            </p>
            <p className="disclaimer">{result.disclaimer}</p>
          </Card>

          {baseline?.series?.length > 0 && dipbuy?.series?.length > 0 && (
            <Card title="Portfolio value over time">
              <BacktestComparisonChart
                seriesA={baseline.series}
                seriesB={dipbuy.series}
                nameA={baseline.strategyName}
                nameB={dipbuy.strategyName}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
