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

  test("matches older sales records by product name", () => {
    const result = getSaleProfitBreakdown(
      { product: "Regular Pork Siomai", qty: 500, price: 5.33 },
      [{ id: 3, name: "Regular Pork Siomai", price: 2400, unit: "packs" }]
    );

    expect(result.cogs).toBe(1200);
    expect(result.grossProfit).toBe(1465);
  });

  test("uses the 50-piece conversion for paper cup profit", () => {
    const result = getSaleProfitBreakdown(
      { inventoryItemId: 2, product: "Paper Cups", qty: 10, price: 12 },
      [{ id: 2, name: "Paper Cups", price: 100, unit: "pieces" }]
    );

    expect(result.cogs).toBe(20);
    expect(result.grossProfit).toBe(100);
  });

  test("uses 100-piece pack costs for included trays and spaghetti styro", () => {
    const inventoryItems = [
      { id: 2, name: "PAPER TRAY ( P10 ) ( 100 PCS )", price: 110, unit: "pieces" },
      { id: 3, name: "PAPER TRAY ( P20 ) ( 100 PCS )", price: 130, unit: "pieces" },
      { id: 4, name: "SPAGHETTI STYRO (100 PCS )", price: 140, unit: "pieces" }
    ];

    expect(
      getSaleProfitBreakdown({ inventoryItemId: 2, qty: 31, price: 0 }, inventoryItems).cogs
    ).toBeCloseTo(34.1);
    expect(
      getSaleProfitBreakdown({ inventoryItemId: 3, qty: 57, price: 0 }, inventoryItems).cogs
    ).toBeCloseTo(74.1);
    expect(
      getSaleProfitBreakdown({ inventoryItemId: 4, qty: 100, price: 0 }, inventoryItems).cogs
    ).toBe(140);
  });
});
