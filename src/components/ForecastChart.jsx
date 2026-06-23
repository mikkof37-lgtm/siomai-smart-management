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

      const key = parsedDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      });
      const revenue = (Number(sale.qty) || 0) * (Number(sale.price) || 0);
      grouped.set(key, (grouped.get(key) || 0) + revenue);
    });

    return Array.from(grouped.entries()).map(([date, value]) => ({ date, value }));
  }, [salesHistory]);

  return (
    <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-[#2b2018]">Recent Revenue</h2>
      </div>
      <div className="h-64">
        {revenueData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#efe6dc] bg-[#fffaf5] text-sm text-[#9a8b7d]">
            No sales recorded yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 6" stroke="#efe6dc" />
              <XAxis dataKey="date" tick={{ fill: "#a28f80", fontSize: 12 }} />
              <YAxis
                tick={{ fill: "#a28f80", fontSize: 12 }}
                tickFormatter={(value) => `PHP ${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  borderColor: "#efe6dc",
                  fontSize: 12
                }}
                formatter={(value) => [`PHP ${value}`, "Revenue"]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#ff7a1a"
                strokeWidth={3}
                dot={{ r: 4, fill: "#ff7a1a" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
