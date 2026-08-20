import { NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./useAuth.js";
import Login from "./pages/Login.js";
import Dashboard from "./pages/Dashboard.js";
import MarketMonitor from "./pages/MarketMonitor.js";
import DipRules from "./pages/DipRules.js";
import Portfolio from "./pages/Portfolio.js";
import Backtesting from "./pages/Backtesting.js";
import AlertHistory from "./pages/AlertHistory.js";
import Settings from "./pages/Settings.js";

export default function App() {
  const auth = useAuth();

  if (!auth.loggedIn) {
    return <Login auth={auth} />;
  }

  return (
    <div className="app">
      <nav className="nav">
        <h1>DipBuy</h1>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/market">Market Monitor</NavLink>
        <NavLink to="/rules">Dip Rules</NavLink>
        <NavLink to="/portfolio">Portfolio</NavLink>
        <NavLink to="/backtesting">Backtesting</NavLink>
        <NavLink to="/alerts">Alert History</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <button className="secondary" style={{ marginTop: 16 }} onClick={auth.logout}>Log out</button>
      </nav>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/market" element={<MarketMonitor />} />
        <Route path="/rules" element={<DipRules />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/backtesting" element={<Backtesting />} />
        <Route path="/alerts" element={<AlertHistory />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
