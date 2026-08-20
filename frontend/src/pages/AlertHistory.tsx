import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function AlertHistory() {
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getNotifications().then(setLogs).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="main">
      <h2>Alert History</h2>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Sent at</th><th>Channel</th><th>Status</th><th>Message</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.sentAt).toLocaleString("en-IN")}</td>
                <td>{l.channel}</td>
                <td>{l.status}</td>
                <td style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{l.messageBody}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p style={{ color: "#9aa1ab" }}>No alerts yet.</p>}
      </div>
    </div>
  );
}
