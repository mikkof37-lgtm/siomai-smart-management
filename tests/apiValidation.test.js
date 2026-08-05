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

describe("API validation", () => {
  test("forecast endpoint rejects invalid payloads", async () => {
    vi.resetModules();

    const { default: handler } = await import("../api/forecast.js");
    const req = {
      method: "POST",
      body: {
        horizonDays: 10,
        salesHistory: {},
        inventory: []
      }
    };
    const res = createResponseMock();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/invalid forecast request/i);
  });

  test("sale receipt endpoint rejects missing receipt fields", async () => {
    vi.resetModules();
    vi.stubEnv("RECEIPT_TO_EMAIL", "owner@example.com");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    vi.stubEnv("RECEIPT_FROM_EMAIL", "");

    const { default: handler } = await import("../api/sale-receipt.js");
    const req = {
      method: "POST",
      body: {
        saleId: "",
        branch: "",
        saleDate: "",
        items: [],
        total: -1
      }
    };
    const res = createResponseMock();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toMatch(/saleId is required/i);
    expect(res.body.detail).toMatch(/branch is required/i);
  });
});

