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
import { compareInventoryDisplayOrder } from "../utils/inventoryOrdering";
import {
  formatInventoryQuantityForDisplay,
  normalizeSiomaiInventoryItem
} from "../utils/siomaiUnits";

const InventoryContext = createContext(null);
const STORAGE_KEY = "smart_inventory_items";
const HISTORY_STORAGE_KEY = "smart_inventory_history";
const ITEM_CODE_SCHEMA_KEY = "smart_inventory_item_code_schema_version";
const ITEM_CODE_SCHEMA_VERSION = 3;
const INVENTORY_TABLE = import.meta.env.VITE_SUPABASE_INVENTORY_TABLE || "inventory_items";
const HISTORY_LIMIT = 100;
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

  const normalized = {
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

  return normalizeSiomaiInventoryItem(normalized);
}

function normalizeInventory(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeItem).filter(Boolean);
}

function resequenceItemCodes(items) {
  const sorted = [...items].sort(compareInventoryDisplayOrder);
  return sorted.map((item, index) => ({
    ...item,
    code: `ITEM-${String(index + 1).padStart(3, "0")}`
  }));
}

function normalizeAuditEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  return {
    id:
      typeof entry.id === "string"
        ? entry.id
        : entry.id === undefined || entry.id === null
        ? `audit-${Date.now()}`
        : String(entry.id),
    type: typeof entry.type === "string" ? entry.type : "updated",
    itemId:
      entry.itemId === undefined || entry.itemId === null ? "" : String(entry.itemId),
    itemName: typeof entry.itemName === "string" ? entry.itemName : "",
    itemCode: typeof entry.itemCode === "string" ? entry.itemCode : "",
    summary: typeof entry.summary === "string" ? entry.summary : "",
    details: typeof entry.details === "string" ? entry.details : "",
    createdAt:
      typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString()
  };
}

function normalizeAuditHistory(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(normalizeAuditEntry).filter(Boolean).slice(0, HISTORY_LIMIT);
}

function formatHistoryValue(value) {
  if (value === undefined || value === null || value === "") return "unset";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "invalid";
  return String(value);
}

function buildAuditEntry(previousItem, nextItem, type, summary, details) {
  const targetItem = nextItem || previousItem;
  return normalizeAuditEntry({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    itemId: targetItem?.id ?? "",
    itemName: targetItem?.name ?? "",
    itemCode: targetItem?.code ?? "",
    summary,
    details,
    createdAt: new Date().toISOString()
  });
}

function buildInventoryAuditEntries(previousItems, nextItems) {
  const previousById = new Map(previousItems.map((item) => [String(item.id), item]));
  const nextById = new Map(nextItems.map((item) => [String(item.id), item]));
  const entries = [];

  for (const item of nextItems) {
    if (!previousById.has(String(item.id))) {
      entries.push(
        buildAuditEntry(
          null,
          item,
          "added",
          `Added ${item.name}.`,
          `Started with ${formatInventoryQuantityForDisplay(item, item.stock, item.unit || "units")} at PHP ${Number(item.price || 0).toFixed(2)}.`
        )
      );
    }
  }

  for (const item of previousItems) {
    if (!nextById.has(String(item.id))) {
      entries.push(
        buildAuditEntry(
          item,
          null,
          "deleted",
          `Deleted ${item.name}.`,
          `Removed from inventory after being tracked at ${formatInventoryQuantityForDisplay(item, item.stock, item.unit || "units")}.`
        )
      );
    }
  }

  for (const nextItem of nextItems) {
    const previousItem = previousById.get(String(nextItem.id));
    if (!previousItem) continue;

    const changes = [];
    const stockDelta = Number(nextItem.stock || 0) - Number(previousItem.stock || 0);

    if (previousItem.name !== nextItem.name) {
      changes.push(`name: ${formatHistoryValue(previousItem.name)} -> ${formatHistoryValue(nextItem.name)}`);
    }
    if (previousItem.code !== nextItem.code) {
      changes.push(`code: ${formatHistoryValue(previousItem.code)} -> ${formatHistoryValue(nextItem.code)}`);
    }
    if (previousItem.category !== nextItem.category) {
      changes.push(
        `category: ${formatHistoryValue(previousItem.category)} -> ${formatHistoryValue(nextItem.category)}`
      );
    }
    if (previousItem.unit !== nextItem.unit) {
      changes.push(`unit: ${formatHistoryValue(previousItem.unit)} -> ${formatHistoryValue(nextItem.unit)}`);
    }
    if (previousItem.threshold !== nextItem.threshold) {
      changes.push(
        `threshold: ${formatHistoryValue(previousItem.threshold)} -> ${formatHistoryValue(nextItem.threshold)}`
      );
    }
    if (previousItem.price !== nextItem.price) {
      changes.push(`price: ${formatHistoryValue(previousItem.price)} -> ${formatHistoryValue(nextItem.price)}`);
    }
    if (previousItem.minStock !== nextItem.minStock) {
      changes.push(
        `minimum stock: ${formatHistoryValue(previousItem.minStock)} -> ${formatHistoryValue(nextItem.minStock)}`
      );
    }
    if (previousItem.maxStock !== nextItem.maxStock) {
      changes.push(
        `maximum stock: ${formatHistoryValue(previousItem.maxStock)} -> ${formatHistoryValue(nextItem.maxStock)}`
      );
    }
    if (stockDelta !== 0) {
      const direction = stockDelta > 0 ? "increased" : "decreased";
      changes.push(
        `stock ${direction} by ${formatInventoryQuantityForDisplay(
          nextItem,
          Math.abs(stockDelta),
          nextItem.unit || "units"
        )} (${formatInventoryQuantityForDisplay(
          previousItem,
          previousItem.stock,
          previousItem.unit || "units"
        )} -> ${formatInventoryQuantityForDisplay(nextItem, nextItem.stock, nextItem.unit || "units")})`
      );
    }

    if (changes.length > 0) {
      entries.push(
        buildAuditEntry(
          previousItem,
          nextItem,
          stockDelta !== 0 && changes.length === 1 ? "stock" : "updated",
          `Updated ${nextItem.name}.`,
          changes.join("; ")
        )
      );
    }
  }

  return entries;
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
    return resequenceItemCodes(normalizeInventory(initialInventory));
  });
  const [inventoryHistoryState, setInventoryHistoryState] = useState(() => {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return normalizeAuditHistory(parsed);
        }
      } catch {
        // Ignore invalid storage and fall back to an empty history.
      }
    }
    return [];
  });
  const [isLoadingInventory, setIsLoadingInventory] = useState(hasSupabaseConfig);
  const [inventorySyncError, setInventorySyncError] = useState("");
  const remoteLoadedRef = useRef(false);

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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventoryState));
  }, [inventoryState]);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(inventoryHistoryState));
  }, [inventoryHistoryState]);

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
        const normalized = normalizeInventory(data);
        const schemaVersion = Number(localStorage.getItem(ITEM_CODE_SCHEMA_KEY) || "0");
        const nextItems =
          schemaVersion >= ITEM_CODE_SCHEMA_VERSION ? normalized : resequenceItemCodes(normalized);

        setInventoryState(nextItems);
        setInventorySyncError("");

        if (schemaVersion < ITEM_CODE_SCHEMA_VERSION) {
          localStorage.setItem(ITEM_CODE_SCHEMA_KEY, String(ITEM_CODE_SCHEMA_VERSION));
          remoteLoadedRef.current = true;
          void syncInventory(normalized, nextItems);
          setIsLoadingInventory(false);
          return;
        }
      }

      setIsLoadingInventory(false);
      remoteLoadedRef.current = true;
    }

    loadInventory();

    return () => {
      isMounted = false;
    };
  }, [syncInventory]);

  const setInventory = useCallback(
    (value) => {
      setInventoryState((current) => {
        const nextItems = typeof value === "function" ? value(current) : value;
        const normalizedNext = normalizeInventory(nextItems);
        const historyEntries = buildInventoryAuditEntries(current, normalizedNext);

        if (historyEntries.length > 0) {
          setInventoryHistoryState((history) => [
            ...historyEntries,
            ...history
          ].slice(0, HISTORY_LIMIT));
        }

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
      inventoryHistory: inventoryHistoryState,
      setInventory,
      isLoadingInventory,
      inventorySyncError
    };
  }, [inventoryState, inventoryHistoryState, setInventory, isLoadingInventory, inventorySyncError]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error("useInventory must be used within an InventoryProvider");
  }
  return ctx;
}
