import { useState } from "react";
import type { useAuth } from "../useAuth.js";

export default function Login({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <div className="main" style={{ maxWidth: 360, margin: "80px auto" }}>
      <div className="card">
        <h2>DipBuy</h2>
        <p style={{ color: "#9aa1ab", fontSize: 13 }}>
          SIP + dip-reserve investment monitor. Alerts only — never places trades.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            onClick={() =>
              mode === "login" ? auth.login(email, password) : auth.register(email, password)
            }
          >
            {mode === "login" ? "Log in" : "Create account"}
          </button>
          <button className="secondary" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
          </button>
          {auth.error && <div className="error">{auth.error}</div>}
        </div>
      </div>
    </div>
  );
}
