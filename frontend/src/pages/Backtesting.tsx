import { useState } from "react";
import { api } from "../api.js";

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
      // DEFAULT_STRATEGY_CONFIG (Rs10k budget, Rs7k normal, Rs3k reserve,
      // Rs15k cap, Rs7k release, Rs500/month multiplier), so this backtest
      // runs the EXACT same engine as live monitoring, per PART 32.
      const res = await api.runBacktest({ symbol, periodYears: Number(periodYears) });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="main">
      <h2>Backtesting</h2>
      <div className="card">
        <p style={{ color: "#9aa1ab", fontSize: 13 }}>
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
          <button onClick={run} disabled={loading} className="btn">{loading ? "Running..." : "Run backtest"}</button>
        </div>
        {error && (
          <div className="error" style={{ marginTop: 8 }}>
            {error}
            <div style={{ color: "#9aa1ab", marginTop: 4 }}>
              Requires a configured MARKET_DATA_API_URL/KEY with historical data for this symbol,
              or pass priceHistory directly via the API.
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className="card">
          <h3>Results — {symbol}, {periodYears} years</h3>
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
                  <td>Rs {r.totalActuallyInvested.toLocaleString("en-IN")}</td>
                  <td>Rs {r.finalPortfolioValue.toLocaleString("en-IN")}</td>
                  <td>Rs {r.absoluteProfit.toLocaleString("en-IN")}</td>
                  <td>{r.cagrPercent}%</td>
                  <td>{r.xirrPercent}%</td>
                  <td>{r.maxDrawdownPercent}%</td>
                  <td>{r.dipDeploymentCount}</td>
                  <td>{r.capDeploymentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 8, color: result.comparison.outperformed ? "#4ade80" : "#f87171" }}>
            {result.comparison.outperformed ? "DipBuy outperformed" : "DipBuy underperformed"} the 100% SIP baseline
            by Rs {result.comparison.valueDifference.toLocaleString("en-IN")} ({result.comparison.outperformancePercent}%).
          </p>
          <p className="disclaimer">{result.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
