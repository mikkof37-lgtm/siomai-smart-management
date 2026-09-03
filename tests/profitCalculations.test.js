import { describe, expect, test } from "vitest";
import { getSaleProfitBreakdown, summarizeSalesProfit } from "../src/utils/profitCalculations";

describe("profit calculations", () => {
  const inventory = [{ id: 1, name: "Chicken Siomai", price: 2400, unit: "packs" }];

  test("calculates siomai revenue, cost, and gross profit", () => {
    const result = getSaleProfitBreakdown(
      { inventoryItemId: 1, product: "Chicken Siomai", qty: 500, price: 5.33 },
      inventory
    );

    expect(result.revenue).toBe(2665);
    expect(result.cogs).toBe(1200);
    expect(result.grossProfit).toBe(1465);
  });

  test("summarizes sales without changing the original records", () => {
    const result = summarizeSalesProfit(
      [{ inventoryItemId: 1, qty: 500, price: 5.33 }],
      inventory
    );

    expect(result).toMatchObject({ revenue: 2665, cogs: 1200, grossProfit: 1465 });
  });

  test("uses the 50-piece conversion for paper cup profit", () => {
    const result = getSaleProfitBreakdown(
      { inventoryItemId: 2, product: "Paper Cups", qty: 10, price: 12 },
      [{ id: 2, name: "Paper Cups", price: 100, unit: "pieces" }]
    );

    expect(result.cogs).toBe(20);
    expect(result.grossProfit).toBe(100);
  });
});
