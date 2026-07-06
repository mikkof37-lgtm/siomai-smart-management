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
import TopBar from "../components/TopBar";
import { useInventory } from "../context/InventoryContext";
import { useSales } from "../context/SalesContext";
import { generateForecast } from "../lib/forecastEngine";

const HORIZON_OPTIONS = [7, 14, 30];

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
  const summaryCards = useMemo(() => {
    return [
      {
        label: "Forecast horizon",
        value: forecast ? `${forecast.horizonDays} days` : `${horizonDays} days`
      },
      {
        label: "Confidence",
        value: forecast ? `${Math.round(forecast.confidence)}%` : "--"
      },
      {
        label: "Predicted units",
        value: forecast
          ? formatNumber(forecastData.reduce((sum, entry) => sum + Number(entry.predictedUnits || 0), 0))
          : "--"
      }
    ];
  }, [forecast, forecastData, horizonDays]);

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
        setForecast(fallback);
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
          subtitle="A simple forecast page that looks at recent sales and gives a basic trend estimate."
        />

        <div className="px-8 pb-10 pt-6">
          <div className="mb-6 rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-[#2b2018]">Demand Forecast</h1>
                <p className="mt-1 text-sm text-[#8c7b6d]">
                  This page estimates future demand from your sales history. For actual buying
                  quantities, use the Restock Orders page.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {HORIZON_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setHorizonDays(option)}
                    className={[
                      "rounded-full border px-4 py-2 text-sm font-semibold transition",
                      horizonDays === option
                        ? "border-[#ff7a1a] bg-[#ff7a1a] text-white"
                        : "border-[#efe6dc] bg-white text-[#6f5f52] hover:border-[#ffb47b]"
                    ].join(" ")}
                  >
                    {option} days
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="rounded-full bg-[#2b2018] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f1712] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGenerating ? "Generating..." : forecast ? "Regenerate" : "Generate forecast"}
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-[#ffd5d0] bg-[#fff4f2] px-4 py-3 text-sm text-[#b0483b]">
                {error}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]"
              >
                <p className="text-sm text-[#8c7b6d]">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-[#2b2018]">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-[#2b2018]">Forecast chart</h2>
                    <p className="text-xs text-[#9a8b7d]">
                      Predicted units and confidence over time
                    </p>
                  </div>
                  <span className="rounded-full bg-[#fffaf5] px-3 py-1 text-[11px] font-semibold text-[#7f6d60]">
                    {forecast ? forecast.source : "No data yet"}
                  </span>
                </div>

                <div className="h-72">
                  {isGenerating ? (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#efe6dc] bg-[#fffaf5] text-sm text-[#9a8b7d]">
                      Generating forecast...
                    </div>
                  ) : forecastData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#efe6dc] bg-[#fffaf5] text-sm text-[#9a8b7d]">
                      Click generate to show the forecast.
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
                            name === "predictedUnits" ? formatNumber(value) : `${Math.round(value)}%`,
                            name === "predictedUnits" ? "Predicted units" : "Confidence"
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="predictedUnits"
                          stroke="#ff7a1a"
                          strokeWidth={3}
                          dot={{ r: 4, fill: "#ff7a1a" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="confidence"
                          stroke="#22a06b"
                          strokeWidth={2}
                          dot={false}
                          strokeDasharray="5 5"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
                <h2 className="text-sm font-semibold text-[#2b2018]">Short summary</h2>
                <p className="mt-3 text-sm leading-6 text-[#6f5f52]">
                  {forecast?.summary ||
                    "This section explains the forecast in simple language after you generate it."}
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
                <h2 className="text-sm font-semibold text-[#2b2018]">Notes</h2>
                <div className="mt-3 space-y-3">
                  {(forecast?.notes?.length ? forecast.notes : ["No notes yet. Generate a forecast first."]).map(
                    (note) => (
                      <div key={note} className="rounded-xl bg-[#fffaf5] px-4 py-3 text-sm text-[#6f5f52]">
                        {note}
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
                <h2 className="text-sm font-semibold text-[#2b2018]">Risks</h2>
                <div className="mt-3 space-y-3">
                  {(forecast?.risks?.length ? forecast.risks : ["Risks will show here after forecasting."]).map(
                    (risk) => (
                      <div key={risk} className="rounded-xl bg-[#fffaf5] px-4 py-3 text-sm text-[#6f5f52]">
                        {risk}
                      </div>
                    )
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
