import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { api } from "../api.js";
import { formatDateTime } from "../lib/format.js";

const NAV_GROUPS = [
  { label: "Overview", links: [{ to: "/", label: "Dashboard", end: true }] },
  {
    label: "Market",
    links: [
      { to: "/market", label: "Markets" },
      { to: "/rules", label: "Strategy" },
    ],
  },
  {
    label: "Money",
    links: [{ to: "/portfolio", label: "Portfolio" }],
  },
  {
    label: "Analysis",
    links: [
      { to: "/backtesting", label: "Backtest" },
      { to: "/alerts", label: "Alerts" },
    ],
  },
  { label: "System", links: [{ to: "/settings", label: "Settings" }] },
];

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/market": "Markets",
  "/rules": "Strategy",
  "/portfolio": "Portfolio",
  "/backtesting": "Backtest",
  "/alerts": "Alert history",
  "/settings": "Settings",
};

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [marketStatus, setMarketStatus] = useState<{ isOpen: boolean; providerName?: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [statusError, setStatusError] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const loadStatus = () => {
    api
      .getMarketStatus()
      .then((s) => {
        setMarketStatus(s);
        setStatusError(false);
        setLastUpdated(new Date());
      })
      .catch(() => setStatusError(true));
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 60_000);
    return () => clearInterval(interval);
  }, []);

  const title = PAGE_TITLES[location.pathname] ?? "DipBuy";

  return (
    <div className="app">
      <nav className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="sidebar-brand" onClick={() => setCollapsed(!collapsed)} style={{ cursor: "pointer" }}>
          <span className="mark" />
          {!collapsed && "DipBuy"}
        </div>
        {NAV_GROUPS.map((group) => (
          <div className="sidebar-group" key={group.label}>
            {!collapsed && <div className="sidebar-group-label">{group.label}</div>}
            {group.links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={"end" in link ? link.end : false}
                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              >
                {!collapsed ? link.label : link.label[0]}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="sidebar-status">
          {!collapsed && (
            <>
              <div className="status-row">
                <span><span className={`status-dot ${statusError ? "error" : "on"}`} />Market data</span>
              </div>
              <div className="status-row">
                <span><span className="status-dot off" />WhatsApp</span>
              </div>
              <div className="status-row">
                <span><span className="status-dot off" />Broker</span>
              </div>
            </>
          )}
        </div>
      </nav>

      <div className="main-col">
        <div className="topbar">
          <h2>{title}</h2>
          <div className="topbar-right">
            <div className="market-pill">
              <span className={`status-dot ${statusError ? "error" : marketStatus?.isOpen ? "on" : "off"}`} />
              NSE {statusError ? "unavailable" : marketStatus?.isOpen ? "OPEN" : "CLOSED"}
            </div>
            <span>Updated {formatDateTime(lastUpdated)}</span>
            <button className="refresh-btn" onClick={loadStatus} title="Refresh" aria-label="Refresh">
              ↻
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
