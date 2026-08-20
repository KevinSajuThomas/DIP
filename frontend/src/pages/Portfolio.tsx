import { useEffect, useState } from "react";
import { api } from "../api.js";

const TYPES = ["ALL", "NORMAL_INVESTMENT", "DIP_DEPLOYMENT", "CAP_DEPLOYMENT"];

export default function Portfolio() {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [filter, setFilter] = useState("ALL");
  const [amount, setAmount] = useState("");
  const [instrument, setInstrument] = useState("NIFTY50");
  const [price, setPrice] = useState("");
  const [type, setType] = useState("NORMAL_INVESTMENT");
  const [error, setError] = useState<string | null>(null);

  const load = (t: string) => api.getPortfolio(t).then(setPortfolio).catch((e) => setError(e.message));
  useEffect(() => { load(filter); }, [filter]);

  const record = async () => {
    try {
      await api.recordTransaction({
        type,
        amount: Number(amount),
        instrument,
        price: price ? Number(price) : undefined,
      });
      setAmount(""); setPrice("");
      load(filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!portfolio) return <div className="main">Loading...</div>;

  return (
    <div className="main">
      <h2>Portfolio</h2>

      <div className="card">
        <div className="grid">
          <div>Total invested<br /><strong>Rs {portfolio.totalInvested.toLocaleString("en-IN")}</strong></div>
          <div>Planned reserve<br /><strong>Rs {portfolio.reserve.plannedReserve.toLocaleString("en-IN")}</strong></div>
          <div>Actual broker cash<br /><strong>{portfolio.reserve.actualBrokerCash ?? "Not available"}</strong></div>
        </div>
        <p style={{ color: "#9aa1ab", fontSize: 12, marginTop: 8 }}>{portfolio.reserve.note}</p>
      </div>

      <div className="card">
        <h3>Record transaction</h3>
        <p style={{ color: "#9aa1ab", fontSize: 13 }}>
          No broker write/read integration is connected — record fills manually after you execute them.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="NORMAL_INVESTMENT">Normal investment</option>
            <option value="DIP_DEPLOYMENT">Dip deployment</option>
            <option value="CAP_DEPLOYMENT">Cap deployment</option>
            <option value="MANUAL_ADJUSTMENT">Manual adjustment</option>
          </select>
          <input placeholder="Instrument" value={instrument} onChange={(e) => setInstrument(e.target.value)} />
          <input placeholder="Amount (Rs)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input placeholder="Price (Rs, optional)" value={price} onChange={(e) => setPrice(e.target.value)} />
          <button onClick={record} disabled={!amount}>Record</button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      <div className="card">
        <h3>Transactions</h3>
        <div style={{ marginBottom: 8 }}>
          {TYPES.map((t) => (
            <button
              key={t}
              className={filter === t ? "" : "secondary"}
              style={{ marginRight: 6 }}
              onClick={() => setFilter(t)}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <table>
          <thead><tr><th>Date</th><th>Instrument</th><th>Type</th><th>Amount</th><th>Price</th><th>Units</th><th>Status</th></tr></thead>
          <tbody>
            {portfolio.transactions.map((t: any) => (
              <tr key={t.id}>
                <td>{new Date(t.date).toLocaleDateString("en-IN")}</td>
                <td>{t.instrument}</td>
                <td>{t.type.replace(/_/g, " ")}</td>
                <td>Rs {Number(t.amount).toLocaleString("en-IN")}</td>
                <td>{t.price ? `Rs ${Number(t.price).toLocaleString("en-IN")}` : "—"}</td>
                <td>{t.units ? Number(t.units).toFixed(4) : "—"}</td>
                <td>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
