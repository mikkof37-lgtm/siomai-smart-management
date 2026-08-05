import { describe, expect, test } from "vitest";
import {
  formatInventoryQuantityForDisplay,
  getSaleInventoryQuantity,
  getSiomaiPackDescription,
  getSiomaiPackSize,
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
});

