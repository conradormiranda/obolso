"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCents } from "@/lib/validation/money";

export type DonutSlice = { key: string; name: string; color: string; cents: number };

/** Rosca da distribuição do gasto por categoria (cores fixas por categoria). */
export function SpendingDonut({ slices, totalCents }: { slices: DonutSlice[]; totalCents: number }) {
  const data = slices.filter((s) => s.cents > 0);
  return (
    <div className="space-y-4">
      {totalCents > 0 ? (
        <div className="relative mx-auto aspect-square w-full max-w-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="cents"
                nameKey="name"
                innerRadius="62%"
                outerRadius="100%"
                paddingAngle={data.length > 1 ? 2 : 0}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => (typeof value === "number" ? formatCents(value) : String(value))}
                contentStyle={{ background: "#2A2A2A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                itemStyle={{ color: "#F2F2F2" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-base font-bold tabular-nums">{formatCents(totalCents)}</span>
          </div>
        </div>
      ) : (
        <p className="py-10 text-center text-muted-foreground">Você não possui gastos cadastrados.</p>
      )}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm" aria-label="Legenda">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            <span className="truncate">{s.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
