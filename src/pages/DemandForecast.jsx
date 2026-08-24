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

export default function DemandForecast({ onLogout, currentUser }) {
  const { inventory } = useInventory();
  const { salesHistory } = useSales();
  const [horizonDays, setHorizonDays] = useState(14);
  const [forecast, setForecast] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const forecastData = useMemo(() => forecast?.demandSeries ?? [], [forecast]);
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
          inventory
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
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f3f7fb_0%,#eef4f8_48%,#e9eff4_100%)] md:flex-row">
      <Sidebar currentUser={currentUser} />
      <div className="flex-1">
        <TopBar
          title="Demand Forecast"
          subtitle="Read the trend, check confidence, and plan the next reorder."
          onLogout={onLogout}
          currentUser={currentUser}
        />

        <div className="px-4 pb-28 pt-4 sm:px-6 sm:pb-28 sm:pt-6 lg:px-8">
          <div className="mb-6 overflow-hidden rounded-[28px] border border-[rgba(49,67,84,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(245,249,252,0.96)_58%,rgba(233,242,248,0.94)_100%)] shadow-[0_24px_64px_-36px_rgba(37,54,67,0.3)]">
            <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] lg:items-center">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#e6f1f7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#37637e]">
                  Planning desk
                </div>
                <h1 className="text-3xl font-semibold text-[#173142] sm:text-4xl">
                  Forecast tomorrow from today&apos;s sales signal.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d7382]">
                  Read the trend line, check confidence, and decide whether the next reorder should
                  be cautious or aggressive.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[20px] border border-[rgba(49,67,84,0.12)] bg-white/90 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5d7382]">
                    Horizon
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[#173142]">
                    {forecast ? `${forecast.horizonDays} days` : `${horizonDays} days`}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[rgba(49,67,84,0.12)] bg-white/90 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5d7382]">
                    Confidence
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[#173142]">
                    {forecast ? `${Math.round(forecast.confidence)}%` : "--"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[rgba(49,67,84,0.12)] bg-white/90 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5d7382]">
                    Projected units
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[#1f6f8b]">
                    {forecast
                      ? formatNumber(
                          forecastData.reduce((sum, entry) => sum + Number(entry.predictedUnits || 0), 0)
                        )
                      : "--"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[rgba(49,67,84,0.12)] bg-white/90 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5d7382]">
                    Signal
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[#1f6f8b]">
                    {forecast ? forecast.source : "Pending"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-[28px] border border-[rgba(49,67,84,0.12)] bg-white/90 p-5 shadow-[0_18px_50px_-32px_rgba(37,54,67,0.28)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#173142]">Forecast controls</h2>
                <p className="mt-1 text-sm text-[#607483]">
                  Choose a horizon and generate the planning view from recent sales.
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
                        ? "border-[#1f6f8b] bg-[#1f6f8b] text-white"
                        : "border-[rgba(49,67,84,0.12)] bg-white text-[#4d6574] hover:border-[#1f6f8b] hover:text-[#1f6f8b]"
                    ].join(" ")}
                  >
                    {option} days
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="rounded-full bg-[#173142] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#102634] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGenerating ? "Generating..." : forecast ? "Refresh forecast" : "Generate forecast"}
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-[#ffd5d0] bg-[#fff4f2] px-4 py-3 text-sm text-[#b0483b]">
                {error}
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
            <div className="space-y-6">
              <div className="rounded-[28px] border border-[rgba(49,67,84,0.12)] bg-white/95 p-5 shadow-[0_18px_50px_-32px_rgba(37,54,67,0.24)]">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5d7382]">
                      Trend line
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-[#173142]">Forecast chart</h2>
                    <p className="text-xs text-[#607483]">Projected units and confidence over time</p>
                  </div>
                  <span className="rounded-full bg-[#e6f1f7] px-3 py-1 text-[11px] font-semibold text-[#37637e]">
                    {forecast ? forecast.source : "No data yet"}
                  </span>
                </div>

                <div className="h-72">
                  {isGenerating ? (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[rgba(49,67,84,0.12)] bg-[#f6f9fb] text-sm text-[#607483]">
                      Generating forecast...
                    </div>
                  ) : forecastData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[rgba(49,67,84,0.12)] bg-[#f6f9fb] text-sm text-[#607483]">
                      Generate a forecast to show the chart.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="4 6" stroke="rgba(49,67,84,0.12)" />
                        <XAxis dataKey="date" tick={{ fill: "#5d7382", fontSize: 12 }} />
                        <YAxis tick={{ fill: "#5d7382", fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#fdfefe",
                            borderRadius: 12,
                            borderColor: "rgba(49,67,84,0.12)",
                            fontSize: 12
                          }}
                          formatter={(value, name) => [
                            name === "predictedUnits" ? formatNumber(value) : `${Math.round(value)}%`,
                            name === "predictedUnits" ? "Projected units" : "Confidence"
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="predictedUnits"
                          stroke="#1f6f8b"
                          strokeWidth={3}
                          dot={{ r: 4, fill: "#1f6f8b" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="confidence"
                          stroke="#7b9e2f"
                          strokeWidth={2}
                          dot={false}
                          strokeDasharray="5 5"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-[rgba(49,67,84,0.12)] bg-white/95 p-5 shadow-[0_18px_50px_-32px_rgba(37,54,67,0.24)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5d7382]">
                  Summary
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[#173142]">Short summary</h2>
                <p className="mt-3 text-sm leading-6 text-[#607483]">
                  {forecast?.summary ||
                    "This section explains the forecast in simple language after you generate it."}
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-[rgba(49,67,84,0.12)] bg-white/95 p-5 shadow-[0_18px_50px_-32px_rgba(37,54,67,0.24)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5d7382]">
                    Notes
                  </p>
                <div className="mt-3 space-y-3">
                  {(forecast?.notes?.length ? forecast.notes : ["No notes yet. Generate a forecast first."]).map(
                    (note) => (
                      <div key={note} className="rounded-xl bg-[#f6f9fb] px-4 py-3 text-sm text-[#4f6575]">
                        {note}
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-[rgba(49,67,84,0.12)] bg-white/95 p-5 shadow-[0_18px_50px_-32px_rgba(37,54,67,0.24)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5d7382]">
                    Watchouts
                  </p>
                <div className="mt-3 space-y-3">
                  {(forecast?.risks?.length ? forecast.risks : ["Watchouts will show here after forecasting."]).map(
                    (risk) => (
                      <div key={risk} className="rounded-xl bg-[#f6f9fb] px-4 py-3 text-sm text-[#4f6575]">
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
