"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/common/ui";
import { BarChart3 } from "lucide-react";

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const tooltipStyle = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--popover-foreground)" },
  labelStyle: { color: "var(--muted-foreground)", marginBottom: 2 },
  itemStyle: { color: "var(--popover-foreground)" },
};

export interface SeriesPoint {
  label: string;
  [key: string]: string | number | null;
}

function Empty({ text }: { text?: string }) {
  return <EmptyState icon={BarChart3} title={text ?? "No data yet"} description="This chart fills in as you log activity." className="h-full min-h-40 border-none" />;
}

function hasData(data: SeriesPoint[], keys: string[]) {
  return data.some((d) => keys.some((k) => typeof d[k] === "number" && (d[k] as number) > 0));
}

export function TrendArea({ data, dataKey, color = "var(--primary)", height = 220, unit = "", domain, emptyText, ariaLabel }: { data: SeriesPoint[]; dataKey: string; color?: string; height?: number; unit?: string; domain?: [number, number]; emptyText?: string; ariaLabel: string }) {
  if (!hasData(data, [dataKey])) return <div style={{ height }}><Empty text={emptyText} /></div>;
  const id = `g-${dataKey}`;
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={axis} axisLine={false} tickLine={false} domain={domain} allowDecimals={false} />
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v}${unit}`, ""]} separator="" />
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${id})`} connectNulls dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, keys, height = 220, unit = "", stacked = false, emptyText, ariaLabel }: { data: SeriesPoint[]; keys: { key: string; label: string; color: string }[]; height?: number; unit?: string; stacked?: boolean; emptyText?: string; ariaLabel: string }) {
  if (!hasData(data, keys.map((k) => k.key))) return <div style={{ height }}><Empty text={emptyText} /></div>;
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={8} />
          <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} formatter={(v, n) => [`${v}${unit}`, keys.find((k) => k.key === n)?.label ?? n]} />
          {keys.map((k, i) => (
            <Bar key={k.key} dataKey={k.key} name={k.key} fill={k.color} stackId={stacked ? "s" : undefined} radius={stacked && i < keys.length - 1 ? 0 : [5, 5, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Lines({ data, keys, height = 220, unit = "", emptyText, ariaLabel, domain }: { data: SeriesPoint[]; keys: { key: string; label: string; color: string }[]; height?: number; unit?: string; emptyText?: string; ariaLabel: string; domain?: [number | "auto", number | "auto"] }) {
  if (!hasData(data, keys.map((k) => k.key))) return <div style={{ height }}><Empty text={emptyText} /></div>;
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={axis} axisLine={false} tickLine={false} domain={domain ?? ["auto", "auto"]} />
          <Tooltip {...tooltipStyle} formatter={(v, n) => [`${v}${unit}`, keys.find((k) => k.key === n)?.label ?? n]} />
          {keys.map((k) => (
            <Line key={k.key} type="monotone" dataKey={k.key} stroke={k.color} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data, height = 200, unit = "", ariaLabel }: { data: { name: string; value: number; color: string }[]; height?: number; unit?: string; ariaLabel: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ height }}><Empty /></div>;
  return (
    <div className="flex items-center gap-4" role="img" aria-label={ariaLabel}>
      <div style={{ height, width: height }} className="shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...tooltipStyle} formatter={(v, n) => [`${v}${unit}`, n]} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 space-y-1.5 text-xs">
        {data
          .filter((d) => d.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((d) => (
            <li key={d.name} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="truncate text-muted-foreground">{d.name}</span>
              <span className="tabular ml-auto pl-2 font-medium">{Math.round((d.value / total) * 100)}%</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

/** GitHub-style activity heatmap (minutes per day). */
export function Heatmap({ days, label, unit = "min" }: { days: { date: string; value: number }[]; label: string; unit?: string }) {
  const max = Math.max(1, ...days.map((d) => d.value));
  const weeks: { date: string; value: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <div className="overflow-x-auto" role="img" aria-label={label}>
      <div className="flex gap-[3px]">
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {w.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.value} ${unit}`}
                className="size-3 rounded-[3px]"
                style={{ background: d.value === 0 ? "var(--muted)" : `color-mix(in oklab, var(--primary) ${20 + Math.round((d.value / max) * 80)}%, transparent)` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
