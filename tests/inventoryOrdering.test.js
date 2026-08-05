import { describe, expect, test } from "vitest";
import { compareInventoryDisplayOrder, getInventoryPriority } from "../src/utils/inventoryOrdering.js";

describe("inventory ordering", () => {
  test("inventory priority keeps core siomai items at the top", () => {
    expect(getInventoryPriority({ name: "Regular Pork Siomai" })).toBe(0);
    expect(getInventoryPriority({ name: "Chicken Siomai" })).toBe(2);
    expect(getInventoryPriority({ name: "Cabbage" })).toBe(1000);
  });

  test("inventory comparison sorts by priority then name", () => {
    const items = [
      { name: "Cabbage" },
      { name: "Chicken Siomai" },
      { name: "Apple" },
      { name: "Regular Pork Siomai" }
    ];

    const sorted = [...items].sort(compareInventoryDisplayOrder).map((item) => item.name);
    expect(sorted).toEqual(["Regular Pork Siomai", "Chicken Siomai", "Apple", "Cabbage"]);
  });
});
