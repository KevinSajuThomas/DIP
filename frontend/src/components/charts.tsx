import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";
import { formatINR, formatDate } from "../lib/format.js";

const THRESHOLD_PERCENTS = [3, 5, 8, 10, 15, 20];

export function PriceChart({
  data,
  referenceHigh,
}: {
  data: Array<{ date: string; close: number }>;
  referenceHigh: number;
}) {
  if (data.length === 0) {
    return <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>No price history available</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => formatDate(d)}
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
          minTickGap={40}
        />
        <YAxis
          domain={["auto", "auto"]}
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
          tickFormatter={(v) => formatINR(v)}
          width={72}
        />
        <Tooltip
          contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(d) => formatDate(d as string)}
          formatter={(v: number) => [formatINR(v), "Price"]}
        />
        <ReferenceLine y={referenceHigh} stroke="var(--accent)" strokeDasharray="4 4" label={{ value: "Ref high", position: "insideTopRight", fill: "var(--accent)", fontSize: 10 }} />
        {THRESHOLD_PERCENTS.map((pct) => (
          <ReferenceLine
            key={pct}
            y={referenceHigh * (1 - pct / 100)}
            stroke="var(--border-strong)"
            strokeDasharray="2 3"
            label={{ value: `-${pct}%`, position: "right", fill: "var(--text-muted)", fontSize: 9 }}
          />
        ))}
        <Line type="monotone" dataKey="close" stroke="var(--accent)" strokeWidth={1.75} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DrawdownChart({
  data,
  referenceHigh,
}: {
  data: Array<{ date: string; close: number }>;
  referenceHigh: number;
}) {
  if (data.length === 0) {
    return <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>No price history available</div>;
  }
  // Derive a rolling reference high client-side so the drawdown line
  // reflects each point's own cycle high, not just today's.
  let runningHigh = data[0].close;
  const chartData = data.map((d) => {
    if (d.close > runningHigh) runningHigh = d.close;
    const drawdown = ((d.close - runningHigh) / runningHigh) * 100;
    return { date: d.date, drawdown: Math.round(drawdown * 100) / 100 };
  });

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} stroke="var(--text-muted)" tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }} minTickGap={40} />
        <YAxis
          domain={[-25, 0]}
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
          tickFormatter={(v) => `${v}%`}
          width={44}
        />
        <Tooltip
          contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(d) => formatDate(d as string)}
          formatter={(v: number) => [`${v.toFixed(2)}%`, "Drawdown"]}
        />
        <Line type="monotone" dataKey="drawdown" stroke="var(--negative)" strokeWidth={1.75} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BacktestComparisonChart({
  seriesA,
  seriesB,
  nameA,
  nameB,
}: {
  seriesA: Array<{ date: string; value: number }>;
  seriesB: Array<{ date: string; value: number }>;
  nameA: string;
  nameB: string;
}) {
  const merged = seriesA.map((point, idx) => ({
    date: point.date,
    [nameA]: point.value,
    [nameB]: seriesB[idx]?.value ?? null,
  }));

  if (merged.length === 0) {
    return <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>No series data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={merged} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} stroke="var(--text-muted)" tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }} minTickGap={50} />
        <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }} tickFormatter={(v) => formatINR(v)} width={80} />
        <Tooltip
          contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(d) => formatDate(d as string)}
          formatter={(v: number) => formatINR(v)}
        />
        <Line type="monotone" dataKey={nameA} stroke="var(--text-secondary)" strokeWidth={1.75} dot={false} />
        <Line type="monotone" dataKey={nameB} stroke="var(--accent)" strokeWidth={1.75} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
