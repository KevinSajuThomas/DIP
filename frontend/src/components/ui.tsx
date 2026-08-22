import type { ReactNode } from "react";

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  tone,
  size = "md",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
  size?: "md" | "lg" | "sm";
}) {
  return (
    <div>
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${size === "lg" ? "lg" : size === "sm" ? "sm" : ""} ${tone ?? ""}`}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export function StatusBadge({ label, className }: { label: string; className: string }) {
  return <span className={`badge ${className}`}>{label}</span>;
}

export function ProgressBar({ percent, warning }: { percent: number; warning?: boolean }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <div className="progress-track">
      <div className={`progress-fill ${warning ? "warning" : ""}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="title">{title}</div>
      <div className="desc">{description}</div>
      {action}
    </div>
  );
}

/** Small inline change indicator that never relies on color alone (uses an
 * arrow glyph too), per accessibility guidance against color-only status. */
export function ChangeIndicator({ value, withSign = true }: { value: number; withSign?: boolean }) {
  const isPositive = value >= 0;
  const arrow = isPositive ? "↑" : "↓";
  const sign = withSign && isPositive ? "+" : "";
  return (
    <span className={`num ${isPositive ? "metric-value positive" : "metric-value negative"}`} style={{ fontSize: 13, fontWeight: 600 }}>
      {sign}{value.toFixed(2)}% {arrow}
    </span>
  );
}
