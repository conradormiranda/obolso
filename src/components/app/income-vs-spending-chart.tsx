"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents } from "@/lib/validation/money";

export type ChartPoint = { label: string; renda: number; gasto: number };

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Renda × gasto total por mês (valores em centavos; formatação só na exibição). */
export function IncomeVsSpendingChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Gráfico de linhas: renda e gasto total por mês">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(31,61,46,0.10)" vertical={false} />
          <XAxis dataKey="label" stroke="#5C635D" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis
            stroke="#5C635D"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => compact.format(Math.trunc(v / 100))}
          />
          <Tooltip
            formatter={(value, name) => [typeof value === "number" ? formatCents(value) : String(value), name === "renda" ? "Renda" : "Gasto"]}
            contentStyle={{ background: "#FFFDF8", border: "1px solid rgba(31,61,46,0.15)", borderRadius: 8 }}
            labelStyle={{ color: "#1E2B24" }}
          />
          <Legend formatter={(v) => (v === "renda" ? "Renda" : "Gasto total")} />
          <Line type="linear" dataKey="renda" stroke="#2E7049" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          <Line type="linear" dataKey="gasto" stroke="#B8996A" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
