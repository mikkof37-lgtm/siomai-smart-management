import { describe, expect, test } from "vitest";
import {
  applyInventoryItemRules,
  getInventoryRuleHint,
  getInventoryRulePriceLabel
} from "../src/utils/inventoryItemRules.js";
import {
  getSalePricingHint,
  getSaleQuantityUnitLabel,
  getSaleUnitPrice,
  isIncludedSaleItem
} from "../src/utils/salePricing.js";

describe("sale pricing rules", () => {
  test("applies paper cup pricing as PHP 12 per piece", () => {
    const paperCups = { name: "12 OZ PAPER CUPS (50 PCS)", price: 100, unit: "packs" };

    expect(getSaleUnitPrice(paperCups)).toBe(12);
    expect(getSaleQuantityUnitLabel(paperCups)).toBe("pieces");
    expect(getSalePricingHint(paperCups)).toContain("PHP 12.00 per piece");
  });

  test("normalizes paper cup inventory data to packs and PHP 100", () => {
    const paperCups = applyInventoryItemRules({
      name: "12 OZ PAPER CUPS (50 PCS)",
      price: 12,
      unit: "pieces"
    });

    expect(paperCups.unit).toBe("pieces");
    expect(paperCups.price).toBe(100);
    expect(getInventoryRuleHint(paperCups)).toContain("displayed in packs");
    expect(getInventoryRulePriceLabel(paperCups)).toBe("PHP 100.00");
  });

  test("keeps included siomai accessories at zero sale price", () => {
    const paperTray = { name: "PAPER TRAY ( P10 ) ( 100 PCS )", price: 100 };
    const paperTrayVariant = { name: "Paper Tray (P20) (100PCS)", price: 100 };

    expect(getSaleUnitPrice(paperTray)).toBe(0);
    expect(isIncludedSaleItem(paperTray)).toBe(true);
    expect(getSalePricingHint(paperTray)).toBe("Included with the siomai sale price.");
    expect(getSaleUnitPrice(paperTrayVariant)).toBe(0);
    expect(isIncludedSaleItem(paperTrayVariant)).toBe(true);

    const spaghettiStyro = { name: "Spaghetti Styro (100 PCS)", price: 100 };
    expect(getSaleUnitPrice(spaghettiStyro)).toBe(0);
    expect(isIncludedSaleItem(spaghettiStyro)).toBe(true);
  });
});
