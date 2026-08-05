import { afterEach, describe, expect, test, vi } from "vitest";
import { FORECAST_HORIZON_OPTIONS, generateForecast } from "../src/lib/forecastEngine.js";

describe("forecast engine", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("forecast constants expose the supported configuration", () => {
    expect(FORECAST_HORIZON_OPTIONS).toEqual([7, 14, 30]);
  });

  test("generateForecast falls back to the local heuristic when no service is configured", async () => {
    const result = await generateForecast({
      salesHistory: [
        { id: 1, date: "2026-07-28", product: "Regular Pork Siomai", qty: 12, price: 6 },
        { id: 2, date: "2026-07-29", product: "Chicken Siomai", qty: 6, price: 6 }
      ],
      inventory: [
        { id: "1", name: "Regular Pork Siomai", stock: 20, threshold: 10, unit: "pcs" },
        { id: "2", name: "Chicken Siomai", stock: 8, threshold: 10, unit: "pcs" }
      ],
      horizonDays: 14
    });

    expect(result.source).toBe("heuristic");
    expect(result.model).toBe(null);
    expect(result.horizonDays).toBe(14);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.salesCount).toBe(2);
    expect(result.inventoryCount).toBe(2);
    expect(result.demandSeries.length).toBe(14);
    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
  });

  test("generateForecast uses the statsmodels service when it is configured", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          source: "statsmodels",
          model: "statsmodels-holtwinters",
          horizonDays: 7,
          confidence: 84,
          demandSeries: [
            { date: "2026-07-30", predictedUnits: 10, confidence: 84 },
            { date: "2026-07-31", predictedUnits: 11, confidence: 83 },
            { date: "2026-08-01", predictedUnits: 12, confidence: 82 },
            { date: "2026-08-02", predictedUnits: 13, confidence: 81 },
            { date: "2026-08-03", predictedUnits: 14, confidence: 80 },
            { date: "2026-08-04", predictedUnits: 15, confidence: 79 },
            { date: "2026-08-05", predictedUnits: 16, confidence: 78 }
          ]
        })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateForecast({
      salesHistory: [
        { id: 1, date: "2026-07-28", product: "Regular Pork Siomai", qty: 12, price: 6 },
        { id: 2, date: "2026-07-29", product: "Chicken Siomai", qty: 6, price: 6 }
      ],
      inventory: [
        { id: "1", name: "Regular Pork Siomai", stock: 20, threshold: 10, unit: "pcs" },
        { id: "2", name: "Chicken Siomai", stock: 8, threshold: 10, unit: "pcs" }
      ],
      horizonDays: 7,
      statsServiceUrl: "http://127.0.0.1:8787/forecast"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("statsmodels");
    expect(result.model).toBe("statsmodels-holtwinters");
    expect(result.horizonDays).toBe(7);
    expect(result.demandSeries).toHaveLength(7);
    expect(result.summary.length).toBeGreaterThan(0);
  });
});
