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
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#fff8f1_0%,#f6efe7_42%,#efe7de_100%)] md:flex-row">
      <Sidebar currentUser={currentUser} />
      <div className="flex-1">
        <TopBar
          title="Demand Forecast"
          subtitle="Read the trend, check confidence, and plan the next reorder."
          onLogout={onLogout}
          currentUser={currentUser}
        />

        <div className="px-4 pb-28 pt-4 sm:px-6 sm:pb-28 sm:pt-6 lg:px-8">
          <div className="mb-6 overflow-hidden rounded-[28px] border border-[rgba(97,72,56,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(255,249,243,0.95)_56%,rgba(255,239,223,0.92)_100%)] shadow-[var(--shadow-soft)]">
            <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] lg:items-center">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b85d11]">
                  Planning desk
                </div>
                <h1 className="text-3xl font-semibold text-[var(--app-text)] sm:text-4xl">
                  Forecast tomorrow from today&apos;s sales signal.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--surface-muted)]">
                  Read the trend line, check confidence, and decide whether the next reorder should
                  be cautious or aggressive.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[20px] border border-[rgba(97,72,56,0.12)] bg-white/90 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                    Horizon
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[var(--app-text)]">
                    {forecast ? `${forecast.horizonDays} days` : `${horizonDays} days`}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[rgba(97,72,56,0.12)] bg-white/90 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                    Confidence
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[var(--app-text)]">
                    {forecast ? `${Math.round(forecast.confidence)}%` : "--"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[rgba(97,72,56,0.12)] bg-white/90 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                    Projected units
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[#b85d11]">
                    {forecast
                      ? formatNumber(
                          forecastData.reduce((sum, entry) => sum + Number(entry.predictedUnits || 0), 0)
                        )
                      : "--"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[rgba(97,72,56,0.12)] bg-white/90 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                    Signal
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[#b85d11]">
                    {forecast ? forecast.source : "Pending"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-[28px] border border-[rgba(97,72,56,0.12)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--app-text)]">Forecast controls</h2>
                <p className="mt-1 text-sm text-[var(--surface-muted)]">
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
                        ? "border-[#f46f1a] bg-[#f46f1a] text-white"
                        : "border-[rgba(97,72,56,0.12)] bg-white text-[#6f5f52] hover:border-[#f46f1a] hover:text-[#f46f1a]"
                    ].join(" ")}
                  >
                    {option} days
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="rounded-full bg-[#2b2018] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f140e] disabled:cursor-not-allowed disabled:opacity-60"
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
              <div className="rounded-[28px] border border-[rgba(97,72,56,0.12)] bg-white/95 p-5 shadow-[var(--shadow-soft)]">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                      Trend line
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-[var(--app-text)]">Forecast chart</h2>
                    <p className="text-xs text-[var(--surface-muted)]">Projected units and confidence over time</p>
                  </div>
                  <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold text-[#b85d11]">
                    {forecast ? forecast.source : "No data yet"}
                  </span>
                </div>

                <div className="h-72">
                  {isGenerating ? (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[rgba(97,72,56,0.12)] bg-[#fffaf5] text-sm text-[var(--surface-muted)]">
                      Generating forecast...
                    </div>
                  ) : forecastData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[rgba(97,72,56,0.12)] bg-[#fffaf5] text-sm text-[var(--surface-muted)]">
                      Generate a forecast to show the chart.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="4 6" stroke="rgba(97,72,56,0.12)" />
                        <XAxis dataKey="date" tick={{ fill: "#79695c", fontSize: 12 }} />
                        <YAxis tick={{ fill: "#79695c", fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#fffdfb",
                            borderRadius: 12,
                            borderColor: "rgba(97,72,56,0.12)",
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
                          stroke="#f46f1a"
                          strokeWidth={3}
                          dot={{ r: 4, fill: "#f46f1a" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="confidence"
                          stroke="#c96f15"
                          strokeWidth={2}
                          dot={false}
                          strokeDasharray="5 5"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-[rgba(97,72,56,0.12)] bg-white/95 p-5 shadow-[var(--shadow-soft)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                  Summary
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--app-text)]">Short summary</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--surface-muted)]">
                  {forecast?.summary ||
                    "This section explains the forecast in simple language after you generate it."}
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-[rgba(97,72,56,0.12)] bg-white/95 p-5 shadow-[var(--shadow-soft)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                    Notes
                  </p>
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

              <div className="rounded-[28px] border border-[rgba(97,72,56,0.12)] bg-white/95 p-5 shadow-[var(--shadow-soft)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                    Watchouts
                  </p>
                <div className="mt-3 space-y-3">
                  {(forecast?.risks?.length ? forecast.risks : ["Watchouts will show here after forecasting."]).map(
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
