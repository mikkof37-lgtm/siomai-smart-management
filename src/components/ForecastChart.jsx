import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { useSales } from "../context/SalesContext";

export default function ForecastChart() {
  const { salesHistory } = useSales();

  const revenueData = useMemo(() => {
    const grouped = new Map();

    salesHistory.forEach((sale) => {
      const parsedDate = new Date(sale.date);
      if (Number.isNaN(parsedDate.getTime())) return;

      const dateKey = [
        parsedDate.getFullYear(),
        String(parsedDate.getMonth() + 1).padStart(2, "0"),
        String(parsedDate.getDate()).padStart(2, "0")
      ].join("-");
      const label = parsedDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      });
      const revenue = (Number(sale.qty) || 0) * (Number(sale.price) || 0);
      grouped.set(dateKey, {
        date: label,
        timestamp: parsedDate.getTime(),
        value: (grouped.get(dateKey)?.value || 0) + revenue
      });
    });

    return Array.from(grouped.values()).sort((left, right) => left.timestamp - right.timestamp);
  }, [salesHistory]);

  return (
    <div className="rounded-[28px] border border-[var(--surface-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,251,247,0.9)_100%)] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
            Revenue rhythm
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--app-text)]">Recent Revenue</h2>
        </div>
        <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold text-[#b85d11]">
          Live sales
        </span>
      </div>
      <div className="h-64">
        {revenueData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-[var(--surface-border)] bg-[#fffaf8] text-sm text-[var(--surface-muted)]">
            No sales recorded yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 6" stroke="rgba(97,72,56,0.12)" />
              <XAxis dataKey="date" tick={{ fill: "#8f7a6a", fontSize: 12 }} />
              <YAxis
                tick={{ fill: "#8f7a6a", fontSize: 12 }}
                tickFormatter={(value) => `PHP ${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fffdfb",
                  borderRadius: 12,
                  borderColor: "rgba(97,72,56,0.12)",
                  fontSize: 12
                }}
                formatter={(value) => [`PHP ${value}`, "Revenue"]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#f46f1a"
                strokeWidth={3}
                dot={{ r: 4, fill: "#f46f1a" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
