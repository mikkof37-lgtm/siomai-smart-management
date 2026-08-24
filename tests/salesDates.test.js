import { describe, expect, test } from "vitest";
import {
  formatSaleDate,
  normalizeSaleDateValue,
  saleDateKey
} from "../src/utils/salesDates.js";

describe("sales date helpers", () => {
  test("normalize legacy dates into ISO keys", () => {
    expect(normalizeSaleDateValue("Jul 29, 2026")).toBe("2026-07-29");
    expect(saleDateKey("2026-07-29")).toBe("2026-07-29");
  });

  test("format sale dates for display", () => {
    expect(formatSaleDate("2026-07-29")).toBe("Jul 29, 2026");
  });
});
