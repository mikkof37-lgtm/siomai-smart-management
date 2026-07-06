import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Sidebar from "../components/Sidebar";
import StatsCard from "../components/StatsCard";
import TopBar from "../components/TopBar";
import { useInventory } from "../context/InventoryContext";
import { useSales } from "../context/SalesContext";
import { generateForecast } from "../lib/forecastEngine";

const HORIZON_OPTIONS = [7, 14, 30];

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatDateLabel(value) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

export default function DemandForecast({ onLogout }) {
  const { inventory } = useInventory();
  const { salesHistory } = useSales();
  const [horizonDays, setHorizonDays] = useState(14);
  const [forecast, setForecast] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const forecastData = useMemo(() => forecast?.demandSeries ?? [], [forecast]);
  const recommendationCount = forecast?.recommendations?.length ?? 0;
  const totalPredictedUnits = useMemo(
    () => forecastData.reduce((sum, entry) => sum + Number(entry.predictedUnits || 0), 0),
    [forecastData]
  );
  const lowStockCount = useMemo(
    () => inventory.filter((item) => Number(item.stock || 0) <= Number(item.threshold || 0)).length,
    [inventory]
  );
  const currentRevenue = useMemo(
    () =>
      salesHistory.reduce((sum, sale) => {
        const qty = Number(sale.qty) || 0;
        const price = Number(sale.price) || 0;
        return sum + qty * price;
      }, 0),
    [salesHistory]
  );

  const chartData = useMemo(() => {
    return forecastData.map((entry) => ({
      date: formatDateLabel(entry.date),
      predictedUnits: Number(entry.predictedUnits || 0),
      confidence: Number(entry.confidence || 0)
    }));
  }, [forecastData]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError("");

    try {
      const response = await fetch("/api/forecast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          horizonDays,
          salesHistory,
          inventory
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.detail || data?.error || "Forecast request failed.");
      }

      setForecast(data);
    } catch (requestError) {
      try {
        const fallback = await generateForecast({
          horizonDays,
          salesHistory,
          inventory,
          apiKey: null
        });
        setForecast({
          ...fallback,
          notes: [
            ...(fallback.notes || []),
            `Using local forecast fallback because the API request failed: ${
              requestError?.message || "Unknown error"
            }`
          ]
        });
        setError("");
      } catch (fallbackError) {
        setError(fallbackError?.message || requestError?.message || "Forecast request failed.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#fbf8f4]">
      <Sidebar onLogout={onLogout} />
      <div className="flex-1">
        <TopBar
          title="Demand Forecast"
          subtitle="Generate an AI-assisted forecast from recent sales and stock levels."
        />

        <div className="px-8 pb-10 pt-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="space-y-6">
              <div className="rounded-[28px] border border-[#efe6dc] bg-[linear-gradient(135deg,#ffffff_0%,#fff8f1_48%,#fff1e3_100%)] p-6 shadow-[0_20px_60px_-35px_rgba(58,41,29,0.55)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#fff1e3] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c96f15]">
                      Forecast engine
                    </div>
                    <h2 className="text-2xl font-semibold text-[#2b2018]">
                      Ask the model for a restock forecast
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-[#8c7b6d]">
                      The endpoint uses your sales history and inventory snapshot to estimate demand,
                      confidence, and suggested order quantities.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="inline-flex items-center justify-center rounded-2xl bg-[#ff7a1a] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(255,122,26,0.9)] transition hover:bg-[#f06d10] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGenerating ? "Generating..." : forecast ? "Regenerate forecast" : "Generate forecast"}
                  </button>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {HORIZON_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setHorizonDays(option)}
                      className={[
                        "rounded-full px-4 py-2 text-sm font-semibold transition",
                        horizonDays === option
                          ? "bg-[#2b2018] text-white shadow-sm"
                          : "bg-white text-[#6f5f52] border border-[#efe6dc] hover:bg-[#fff8f1]"
                      ].join(" ")}
                    >
                      {option} days
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="mt-5 rounded-2xl border border-[#ffd5d0] bg-[#fff4f2] px-4 py-3 text-sm text-[#b0483b]">
                    {error}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#2b2018]">Forecast trend</h3>
                    <p className="text-xs text-[#9a8b7d]">
                      {forecast ? `Source: ${forecast.source === "openai" ? "OpenAI GPT-5.5" : "Heuristic fallback"}` : "Generate a forecast to see demand estimates."}
                    </p>
                  </div>
                  {forecast && (
                    <div className="rounded-full bg-[#fff1e3] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c96f15]">
                      {forecast.horizonDays}-day view
                    </div>
                  )}
                </div>

                <div className="h-72">
                  {isGenerating ? (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#efe6dc] bg-[#fffaf5] text-sm text-[#9a8b7d]">
                      Generating your forecast...
                    </div>
                  ) : forecastData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#efe6dc] bg-[#fffaf5] text-sm text-[#9a8b7d]">
                      No forecast yet. Click generate to begin.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="4 6" stroke="#efe6dc" />
                        <XAxis dataKey="date" tick={{ fill: "#a28f80", fontSize: 12 }} />
                        <YAxis tick={{ fill: "#a28f80", fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#ffffff",
                            borderRadius: 12,
                            borderColor: "#efe6dc",
                            fontSize: 12
                          }}
                          formatter={(value, name) => [
                            name === "predictedUnits" ? formatNumber(value) : formatPercent(value),
                            name === "predictedUnits" ? "Predicted units" : "Confidence"
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="predictedUnits"
                          stroke="#ff7a1a"
                          strokeWidth={3}
                          dot={{ r: 4, fill: "#ff7a1a" }}
                          activeDot={{ r: 6 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="confidence"
                          stroke="#22a06b"
                          strokeWidth={2}
                          dot={false}
                          strokeDasharray="6 6"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
                <h3 className="text-sm font-semibold text-[#2b2018]">Forecast summary</h3>
                <p className="mt-3 text-sm leading-6 text-[#6f5f52]">
                  {forecast?.summary || "Run a forecast to get a summary of demand trends and restock needs."}
                </p>

                {forecast?.notes?.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                      Notes
                    </h4>
                    <ul className="mt-2 space-y-2 text-sm text-[#6f5f52]">
                      {forecast.notes.map((note) => (
                        <li key={note} className="rounded-2xl bg-[#fffaf5] px-4 py-3">
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <StatsCard
                  title="Forecast Confidence"
                  value={forecast ? `${Math.round(forecast.confidence)}%` : "--"}
                  desc={forecast ? "Model confidence score" : "No forecast generated yet"}
                  trend="neutral"
                  iconBg="bg-[#e8f7ee]"
                  iconColor="text-[#22a06b]"
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 3l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7l8-4Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <path d="M9 12l2 2 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                />

                <StatsCard
                  title="Predicted Units"
                  value={forecast ? formatNumber(totalPredictedUnits) : "--"}
                  desc={forecast ? `Across the next ${forecast.horizonDays} days` : "Forecast not generated"}
                  trend="neutral"
                  iconBg="bg-[#fff1e3]"
                  iconColor="text-[#ff7a1a]"
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 18h16"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M7 14V9m5 5V6m5 8v-3"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  }
                />

                <StatsCard
                  title="Low Stock Items"
                  value={String(lowStockCount)}
                  desc="Tracked SKUs near threshold"
                  trend={lowStockCount > 0 ? "down" : "neutral"}
                  descClassName={lowStockCount > 0 ? "text-[#ff6a5a]" : "text-[#9a8b7d]"}
                  iconBg="bg-[#ffeceb]"
                  iconColor="text-[#ff6a5a]"
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M12 9v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path
                        d="M10.3 4.9 4.1 15.6a2 2 0 0 0 1.7 3h12.4a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  }
                />

                <StatsCard
                  title="Sales Records"
                  value={String(salesHistory.length)}
                  desc={currentRevenue > 0 ? `PHP ${formatNumber(currentRevenue)} revenue tracked` : "No sales recorded yet"}
                  trend="neutral"
                  iconBg="bg-[#f1ebff]"
                  iconColor="text-[#7c5cff]"
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 15l5-5 4 4 7-7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path d="M20 7h-4V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  }
                />
              </div>

              <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#2b2018]">Restock recommendations</h3>
                    <p className="text-xs text-[#9a8b7d]">
                      Suggested order quantities from the latest forecast
                    </p>
                  </div>
                  <span className="rounded-full bg-[#fff1e3] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c96f15]">
                    {recommendationCount}
                  </span>
                </div>

                <div className="space-y-3">
                  {forecast?.recommendations?.length > 0 ? (
                    forecast.recommendations.map((item) => (
                      <div
                        key={item.itemName}
                        className="rounded-2xl border border-[#f2eae0] bg-[#fffaf5] px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[#2b2018]">{item.itemName}</p>
                            <p className="text-xs text-[#9a8b7d]">
                              Current stock: {formatNumber(item.currentStock)}
                            </p>
                            <p className="mt-1 text-xs text-[#6f5f52]">{item.reason}</p>
                          </div>
                          <div className="rounded-2xl bg-[#ff7a1a] px-3 py-2 text-right text-white shadow-[0_12px_30px_-20px_rgba(255,122,26,0.95)]">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
                              Order
                            </div>
                            <div className="text-lg font-semibold">
                              {formatNumber(item.recommendedOrderQty)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#efe6dc] bg-[#fffaf5] px-4 py-5 text-sm text-[#9a8b7d]">
                      Run a forecast to see item-specific reorder guidance.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
                <h3 className="text-sm font-semibold text-[#2b2018]">Forecast risks</h3>
                <div className="mt-3 space-y-3">
                  {forecast?.risks?.length > 0 ? (
                    forecast.risks.map((risk) => (
                      <div key={risk} className="rounded-2xl bg-[#fffaf5] px-4 py-3 text-sm text-[#6f5f52]">
                        {risk}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#efe6dc] bg-[#fffaf5] px-4 py-5 text-sm text-[#9a8b7d]">
                      Risks will appear here after the forecast runs.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
