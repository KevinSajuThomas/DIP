import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Settings() {
  const [strategy, setStrategy] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getStrategy().then((s) => { setStrategy(s); setForm(s.settings); }).catch((e) => setError(e.message));
  }, []);

  const update = (field: string, value: any) => setForm({ ...form, [field]: value });

  const allocationValid = form && Number(form.normalInvestment) + Number(form.reserveContribution) === Number(form.monthlyBudget);

  const save = async () => {
    setError(null);
    try {
      const updated = await api.updateStrategySettings({
        monthlyBudget: Number(form.monthlyBudget),
        normalInvestment: Number(form.normalInvestment),
        reserveContribution: Number(form.reserveContribution),
        maxReserve: Number(form.maxReserve),
        capRelease: Number(form.capRelease),
        dipDeploymentMultiplier: Number(form.dipDeploymentMultiplier),
        whatsappEnabled: form.whatsappEnabled,
        pollingIntervalSeconds: Number(form.pollingIntervalSeconds),
      });
      setForm(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const sendTest = async () => {
    try {
      const res = await api.sendTestNotification();
      setTestResult(res.result.ok ? "Test message sent." : `Failed: ${res.result.errorMessage}`);
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : String(e));
    }
  };

  if (!form) return <div className="main">Loading...</div>;

  return (
    <div className="main">
      <h2>Settings</h2>

      <div className="card">
        <h3>Strategy configuration</h3>
        <div className="grid">
          <label>Monthly budget<br /><input value={form.monthlyBudget} onChange={(e) => update("monthlyBudget", e.target.value)} /></label>
          <label>Normal investment<br /><input value={form.normalInvestment} onChange={(e) => update("normalInvestment", e.target.value)} /></label>
          <label>Reserve contribution<br /><input value={form.reserveContribution} onChange={(e) => update("reserveContribution", e.target.value)} /></label>
          <label>Maximum reserve<br /><input value={form.maxReserve} onChange={(e) => update("maxReserve", e.target.value)} /></label>
          <label>Cap release amount<br /><input value={form.capRelease} onChange={(e) => update("capRelease", e.target.value)} /></label>
          <label>Dip deployment multiplier (Rs/month)<br /><input value={form.dipDeploymentMultiplier} onChange={(e) => update("dipDeploymentMultiplier", e.target.value)} /></label>
        </div>
        {!allocationValid && (
          <div className="error" style={{ marginTop: 8 }}>
            Normal investment + reserve contribution must equal monthly budget.
          </div>
        )}
      </div>

      <div className="card">
        <h3>Alerts</h3>
        <label>
          <input type="checkbox" checked={form.whatsappEnabled} onChange={(e) => update("whatsappEnabled", e.target.checked)} />
          {" "}WhatsApp alerts enabled
        </label>
        <div style={{ marginTop: 8 }}>
          Polling interval (seconds)<br />
          <input value={form.pollingIntervalSeconds} onChange={(e) => update("pollingIntervalSeconds", e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={sendTest}>Send Test WhatsApp</button>
          {testResult && <div style={{ marginTop: 8, fontSize: 13 }}>{testResult}</div>}
        </div>
      </div>

      <button onClick={save} disabled={!allocationValid}>Save settings</button>
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

      <p className="disclaimer">
        DipBuy is a personal investment tracking and decision-support tool. Historical results do
        not guarantee future returns. No investment outcome is guaranteed.
      </p>
    </div>
  );
}
