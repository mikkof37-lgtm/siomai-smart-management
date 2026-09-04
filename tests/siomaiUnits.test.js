import { describe, expect, test } from "vitest";
import {
  formatInventoryQuantityForDisplay,
  getSaleInventoryQuantity,
  getSaleStockDisplayQuantity,
  getSiomaiPackDescription,
  getSiomaiPackSize,
  isPaperCupItem,
  normalizeSiomaiInventoryItem,
  roundSiomaiQuantity
} from "../src/utils/siomaiUnits";

describe("siomai unit helpers", () => {
  test("use the explicit 1000-piece pack size for the configured siomai items", () => {
    expect(getSiomaiPackSize("Regular Pork Siomai")).toBe(1000);
    expect(getSiomaiPackSize("Chicken Siomai")).toBe(1000);
    expect(getSiomaiPackSize("Premium Pork Siomai")).toBe(1000);
    expect(getSiomaiPackSize("Japanese Siomai")).toBe(100);
  });

  test("convert sold pieces into pack quantities without floating point drift", () => {
    expect(getSaleInventoryQuantity("Regular Pork Siomai", 3)).toBe(0.003);
    expect(roundSiomaiQuantity(44.999999999, "Premium Pork Siomai")).toBe(45);
    expect(formatInventoryQuantityForDisplay("Regular Pork Siomai", 0.003)).toBe("0.003 packs");
  });

  test("convert paper cup sales into 50-piece pack deductions", () => {
    expect(getSaleInventoryQuantity("12 OZ PAPER CUPS (50 PCS)", 50)).toBe(1);
    expect(getSaleInventoryQuantity("12 OZ PAPER CUPS (50 PCS)", 1)).toBe(0.02);
    expect(getSaleStockDisplayQuantity("12 OZ PAPER CUPS (50 PCS)", 13)).toBe(650);
    expect(isPaperCupItem("12 OZ PAPER CUPS (50 PCS)")).toBe(true);
    expect(formatInventoryQuantityForDisplay("12 OZ PAPER CUPS (50 PCS)", 649, "pieces")).toBe(
      "649 pieces"
    );
  });

  test("normalize stale premium siomai data to the latest inventory rule", () => {
    const migrated = normalizeSiomaiInventoryItem({
      name: "Premium Pork Siomai",
      unit: "pieces",
      stock: 12.3456,
      threshold: 99.9999,
      minStock: 10.3333,
      maxStock: 200.8888,
      price: 150
    });

    expect(migrated.unit).toBe("packs");
    expect(migrated.stock).toBe(12.346);
    expect(migrated.threshold).toBe(100);
    expect(migrated.minStock).toBe(10.333);
    expect(migrated.maxStock).toBe(200.889);
    expect(migrated.price).toBe(2950);
    expect(getSiomaiPackDescription("Premium Pork Siomai")).toBe("1 pack = 1000 pcs");
  });

  test("normalizes chicken siomai to the PHP 2400 owner pack cost", () => {
    const normalized = normalizeSiomaiInventoryItem({
      name: "Chicken Siomai",
      unit: "packs",
      stock: 3,
      price: 110
    });

    expect(normalized.price).toBe(2400);
  });

  test("normalizes regular pork siomai to the PHP 2400 owner pack cost", () => {
    const normalized = normalizeSiomaiInventoryItem({
      name: "Regular Pork Siomai",
      stock: 12,
      unit: "packs",
      price: 120
    });

    expect(normalized.price).toBe(2400);
  });
});
