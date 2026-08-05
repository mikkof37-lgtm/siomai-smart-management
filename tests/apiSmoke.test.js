import { describe, expect, test, vi } from "vitest";

function createResponseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe("API smoke tests", () => {
  test("forecast endpoint falls back to heuristic output", async () => {
    vi.resetModules();
    vi.stubEnv("FORECAST_STATS_SERVICE_URL", "");
    vi.stubEnv("FORECAST_SUMMARY_URL", "");

    const { default: handler } = await import("../api/forecast.js");
    const req = {
      method: "POST",
      body: {
        horizonDays: 14,
        salesHistory: [
          { id: 1, date: "2026-07-29", product: "Regular Pork Siomai", qty: 4, price: 6 }
        ],
        inventory: [
          { id: 1, name: "Regular Pork Siomai", stock: 12, threshold: 10, unit: "pcs" }
        ]
      }
    };
    const res = createResponseMock();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe("heuristic");
    expect(res.body.horizonDays).toBe(14);
    expect(res.body.demandSeries.length).toBe(14);
  });

  test("daily sales report skips cleanly when credentials are missing", async () => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("REPORT_TO_EMAIL", "");
    vi.stubEnv("RECEIPT_TO_EMAIL", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");

    const { default: handler } = await import("../api/daily-sales-report.js");
    const req = { method: "GET" };
    const res = createResponseMock();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.skipped).toBe(true);
    expect(res.body.error).toMatch(/Supabase service credentials/i);
  });

  test("sale receipt skips cleanly when no recipient is configured", async () => {
    vi.resetModules();
    vi.stubEnv("RECEIPT_TO_EMAIL", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    vi.stubEnv("RECEIPT_FROM_EMAIL", "");

    const { default: handler } = await import("../api/sale-receipt.js");
    const req = {
      method: "POST",
      body: {
        saleId: "sale-123",
        branch: "Talavera 2",
        saleDate: "2026-07-29",
        recordedAt: "2026-07-29T12:00:00Z",
        items: [
          { name: "Regular Pork Siomai", qty: 1, unit: "pcs", unitPrice: 6, subtotal: 6 },
          { product: "Chicken Siomai", qty: 2, unit: "pcs", unitPrice: 6, subtotal: 12 }
        ],
        total: 18
      }
    };
    const res = createResponseMock();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.skipped).toBe(true);
    expect(res.body.error).toMatch(/receipt recipient email/i);
  });
});
