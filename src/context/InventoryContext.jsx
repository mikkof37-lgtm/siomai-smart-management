import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { inventory as initialInventory } from "../data/InventoryData";

const InventoryContext = createContext(null);
const STORAGE_KEY = "smart_inventory_items";
const UNIT_ALIASES = {
  pcs: "pieces",
  piece: "pieces",
  pieces: "pieces",
  pack: "packs",
  packs: "packs",
  gal: "gallon",
  gallon: "gallon",
  gallons: "gallon",
  kg: "kg"
};
const ITEM_NAME_ALIASES = {
  "special japanase siomai": "Special Japanese Siomai"
};

function normalizeUnit(unit) {
  if (typeof unit !== "string") return "";
  const normalized = unit.trim().toLowerCase();
  return UNIT_ALIASES[normalized] || normalized;
}

function normalizeInventory(items) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => ({
    ...item,
    name:
      typeof item.name === "string"
        ? ITEM_NAME_ALIASES[item.name.trim().toLowerCase()] || item.name.trim()
        : item.name,
    unit: normalizeUnit(item.unit)
  }));
}

export function InventoryProvider({ children }) {
  const [inventory, setInventory] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return normalizeInventory(parsed);
        }
      } catch {
        // Ignore invalid storage and fall back to seed data.
      }
    }
    return normalizeInventory(initialInventory);
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
  }, [inventory]);

  const value = useMemo(() => {
    return { inventory, setInventory };
  }, [inventory]);

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error("useInventory must be used within an InventoryProvider");
  }
  return ctx;
}
