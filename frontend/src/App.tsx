import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.js";
import Dashboard from "./pages/Dashboard.js";
import MarketMonitor from "./pages/MarketMonitor.js";
import Backtesting from "./pages/Backtesting.js";
import AlertHistory from "./pages/AlertHistory.js";
import Settings from "./pages/Settings.js";

// DipBuy is a private, single-user, self-hosted tool — no login screen.
// Kept deliberately minimal: current price, dip status, backtest, alerts,
// settings. Portfolio logging and threshold editing were dropped from the
// nav per request — the underlying API routes still exist if needed later.
export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/market" element={<MarketMonitor />} />
        <Route path="/backtesting" element={<Backtesting />} />
        <Route path="/alerts" element={<AlertHistory />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
