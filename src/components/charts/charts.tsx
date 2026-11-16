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

// Bold Blocks chart styling: flat block fills, ink outlines, a solid ink baseline,
// faint ink gridlines, muted mono axis text and a card-recipe tooltip.
const INK = "var(--ink)";
const axis = { fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)", fontWeight: 500 };
const baseline = { stroke: INK, strokeWidth: 2 };
const grid = { vertical: false, stroke: INK, strokeOpacity: 0.12 } as const;
const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: `2px solid ${INK}`,
    borderRadius: 10,
    boxShadow: "4px 4px 0 0 var(--shadow-ink)",
    padding: "8px 10px",
    fontSize: 12,
    color: "var(--card-foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)", marginBottom: 4, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const },
  itemStyle: { color: "var(--card-foreground)", fontFamily: "var(--font-mono)", fontWeight: 500, padding: 0 },
};
const lineCursor = { stroke: INK, strokeWidth: 1.5, strokeDasharray: "4 3" };

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
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="label" tick={axis} axisLine={baseline} tickLine={false} minTickGap={16} />
          <YAxis tick={axis} axisLine={false} tickLine={false} domain={domain} allowDecimals={false} />
          <Tooltip {...tooltipStyle} cursor={lineCursor} formatter={(v) => [`${v}${unit}`, ""]} separator="" />
          <Area type="monotone" dataKey={dataKey} stroke={INK} strokeWidth={2.5} fill={color} fillOpacity={0.55} connectNulls dot={false} activeDot={{ r: 5, fill: color, stroke: INK, strokeWidth: 2 }} />
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
          <CartesianGrid {...grid} />
          <XAxis dataKey="label" tick={axis} axisLine={baseline} tickLine={false} minTickGap={8} />
          <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.7 }} formatter={(v, n) => [`${v}${unit}`, keys.find((k) => k.key === n)?.label ?? n]} />
          {keys.map((k, i) => (
            <Bar key={k.key} dataKey={k.key} name={k.key} fill={k.color} stroke={INK} strokeWidth={2} stackId={stacked ? "s" : undefined} radius={stacked && i < keys.length - 1 ? 0 : [4, 4, 0, 0]} maxBarSize={36} />
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
          <CartesianGrid {...grid} />
          <XAxis dataKey="label" tick={axis} axisLine={baseline} tickLine={false} minTickGap={16} />
          <YAxis tick={axis} axisLine={false} tickLine={false} domain={domain ?? ["auto", "auto"]} />
          <Tooltip {...tooltipStyle} cursor={lineCursor} formatter={(v, n) => [`${v}${unit}`, keys.find((k) => k.key === n)?.label ?? n]} />
          {/* Ink casing under each line so pale block colours (lime, sun, orange)
              stay visible against the white card. Hidden from the tooltip. */}
          {keys.map((k) => (
            <Line key={`${k.key}-casing`} type="monotone" dataKey={k.key} stroke={INK} strokeWidth={5.5} dot={false} activeDot={false} tooltipType="none" legendType="none" connectNulls />
          ))}
          {keys.map((k) => (
            <Line key={k.key} type="monotone" dataKey={k.key} stroke={k.color} strokeWidth={3} dot={{ r: 3.5, fill: k.color, stroke: INK, strokeWidth: 1.5 }} activeDot={{ r: 5, fill: k.color, stroke: INK, strokeWidth: 2 }} connectNulls />
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
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="94%" paddingAngle={0} stroke={INK} strokeWidth={2}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 space-y-2 text-xs">
        {data
          .filter((d) => d.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((d) => (
            <li key={d.name} className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-[3px] border-[1.5px] border-ink" style={{ background: d.color }} aria-hidden />
              <span className="truncate text-muted-foreground">{d.name}</span>
              <span className="tabular ml-auto pl-2 font-mono font-medium">{Math.round((d.value / total) * 100)}%</span>
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
    <div className="scrollbar-thin overflow-x-auto pb-1" role="img" aria-label={label}>
      <div className="flex gap-[3px]">
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {w.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.value} ${unit}`}
                className="size-3 rounded-[3px] border border-ink/15"
                style={{ background: d.value === 0 ? "var(--muted)" : `color-mix(in oklab, var(--block-lime) ${25 + Math.round((d.value / max) * 75)}%, var(--card))` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
