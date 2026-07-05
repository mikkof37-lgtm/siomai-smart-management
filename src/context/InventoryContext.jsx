/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { supabase } from "../lib/supabaseClient";
import { inventory as initialInventory } from "../data/InventoryData";

const InventoryContext = createContext(null);
const STORAGE_KEY = "smart_inventory_items";
const INVENTORY_TABLE = import.meta.env.VITE_SUPABASE_INVENTORY_TABLE || "inventory_items";
const hasSupabaseConfig =
  Boolean(import.meta.env.VITE_SUPABASE_URL) && Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

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
  "pork siomai (premium)": "Regular Pork Siomai",
  "special japanase siomai": "Special Japanese Siomai"
};

function normalizeUnit(unit) {
  if (typeof unit !== "string") return "";
  const normalized = unit.trim().toLowerCase();
  return UNIT_ALIASES[normalized] || normalized;
}

function normalizeNumber(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;

  const id = item.id ?? item.item_id ?? item.code ?? Date.now();
  const name =
    typeof item.name === "string"
      ? ITEM_NAME_ALIASES[item.name.trim().toLowerCase()] || item.name.trim()
      : item.name ?? "";

  return {
    ...item,
    id,
    name,
    code: typeof item.code === "string" ? item.code.trim() : item.code ?? "",
    category: typeof item.category === "string" ? item.category.trim() : item.category ?? "",
    unit: normalizeUnit(item.unit),
    stock: Number(item.stock ?? 0),
    threshold: Number(item.threshold ?? 0),
    price: Number(item.price ?? 0),
    minStock: normalizeNumber(item.minStock ?? item.minstock),
    maxStock: normalizeNumber(item.maxStock ?? item.maxstock),
    updatedAt:
      typeof item.updatedAt === "string"
        ? item.updatedAt
        : typeof item.updatedat === "string"
        ? item.updatedat
        : item.updatedAt ?? item.updatedat ?? ""
  };
}

function normalizeInventory(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeItem).filter(Boolean);
}

function toInventoryRow(item) {
  return {
    id: item.id,
    code: item.code || null,
    name: item.name || null,
    category: item.category || null,
    stock: Number(item.stock || 0),
    unit: normalizeUnit(item.unit),
    threshold: Number(item.threshold || 0),
    price: Number(item.price || 0),
    minstock: normalizeNumber(item.minStock) ?? null,
    maxstock: normalizeNumber(item.maxStock) ?? null,
    updatedat: item.updatedAt || new Date().toISOString()
  };
}

export function InventoryProvider({ children }) {
  const [inventoryState, setInventoryState] = useState(() => {
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
  const [isLoadingInventory, setIsLoadingInventory] = useState(hasSupabaseConfig);
  const [inventorySyncError, setInventorySyncError] = useState("");
  const remoteLoadedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventoryState));
  }, [inventoryState]);

  useEffect(() => {
    let isMounted = true;

    async function loadInventory() {
      if (!hasSupabaseConfig || !supabase) {
        setIsLoadingInventory(false);
        remoteLoadedRef.current = true;
        return;
      }

      const { data, error } = await supabase
        .from(INVENTORY_TABLE)
        .select("*")
        .order("id", { ascending: true });

      if (!isMounted) return;

      if (error) {
        const detail = error.message || error.code || "Unknown Supabase error";
        setInventorySyncError(
          `Using local cache because Supabase inventory could not be loaded from "${INVENTORY_TABLE}". ${detail}`
        );
        setIsLoadingInventory(false);
        remoteLoadedRef.current = true;
        return;
      }

      if (Array.isArray(data)) {
        setInventoryState(normalizeInventory(data));
        setInventorySyncError("");
      }

      setIsLoadingInventory(false);
      remoteLoadedRef.current = true;
    }

    loadInventory();

    return () => {
      isMounted = false;
    };
  }, []);

  const syncInventory = useCallback(
    async (previousItems, nextItems) => {
      if (!hasSupabaseConfig || !supabase || !remoteLoadedRef.current) return;

      const nextById = new Map(nextItems.map((item) => [String(item.id), item]));
      const removedIds = previousItems
        .filter((item) => !nextById.has(String(item.id)))
        .map((item) => item.id);

      try {
        if (removedIds.length > 0) {
          const { error: deleteError } = await supabase
            .from(INVENTORY_TABLE)
            .delete()
            .in("id", removedIds);

          if (deleteError) throw deleteError;
        }

        if (nextItems.length > 0) {
          const rows = nextItems.map(toInventoryRow);
          const { error: upsertError } = await supabase
            .from(INVENTORY_TABLE)
            .upsert(rows, { onConflict: "id" });

          if (upsertError) throw upsertError;
        }

        setInventorySyncError("");
      } catch (error) {
        // Surface the actual failure so we can fix the backend instead of guessing.
        console.error("Inventory sync failed:", error);
        // Keep local changes even if the remote write fails.
        setInventorySyncError(
          `Inventory changes were saved locally, but Supabase sync failed for "${INVENTORY_TABLE}". ${error?.message || "Check the browser console for the Supabase error."}`
        );
      }
    },
    []
  );

  const setInventory = useCallback(
    (value) => {
      setInventoryState((current) => {
        const nextItems = typeof value === "function" ? value(current) : value;
        const normalizedNext = normalizeInventory(nextItems);

        if (remoteLoadedRef.current) {
          void syncInventory(current, normalizedNext);
        }

        return normalizedNext;
      });
    },
    [syncInventory]
  );

  const value = useMemo(() => {
    return {
      inventory: inventoryState,
      setInventory,
      isLoadingInventory,
      inventorySyncError
    };
  }, [inventoryState, setInventory, isLoadingInventory, inventorySyncError]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error("useInventory must be used within an InventoryProvider");
  }
  return ctx;
}
