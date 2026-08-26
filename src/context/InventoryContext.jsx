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
import { applyInventoryItemRules } from "../utils/inventoryItemRules";
import {
  formatInventoryQuantityForDisplay,
  normalizeSiomaiInventoryItem
} from "../utils/siomaiUnits";
import { buildInventoryAuditLogs, queueAuditLogs, flushQueuedAuditLogs } from "../utils/auditTrail";

const InventoryContext = createContext(null);
const STORAGE_KEY = "smart_inventory_items";
const HISTORY_STORAGE_KEY = "smart_inventory_history";
const LAST_SYNC_KEY = "smart_inventory_items_last_synced";
const DELETED_IDS_KEY = "smart_inventory_deleted_ids";
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

  return applyInventoryItemRules(normalizeSiomaiInventoryItem(normalized));
}

function normalizeInventory(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeItem).filter(Boolean);
}

function normalizeInventoryIdList(items) {
  if (!Array.isArray(items)) return [];

  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
}

function filterDeletedInventory(items, deletedIds) {
  const tombstones = new Set(normalizeInventoryIdList(deletedIds));
  if (tombstones.size === 0) return normalizeInventory(items);

  return normalizeInventory(items).filter((item) => !tombstones.has(String(item.id)));
}

function readStoredDeletedInventoryIds() {
  const stored = localStorage.getItem(DELETED_IDS_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return normalizeInventoryIdList(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function mergeInventorySnapshots(remoteItems, localItems, deletedIds = []) {
  const tombstones = new Set(normalizeInventoryIdList(deletedIds));
  const mergedById = new Map();

  [...normalizeInventory(remoteItems), ...normalizeInventory(localItems)].forEach((item) => {
    if (tombstones.has(String(item.id))) return;
    mergedById.set(String(item.id), item);
  });

  return [...mergedById.values()];
}

function readStoredInventorySnapshot() {
  const stored = localStorage.getItem(LAST_SYNC_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return filterDeletedInventory(Array.isArray(parsed) ? parsed : [], readStoredDeletedInventoryIds());
  } catch {
    return [];
  }
}

function getInventoryTimestamp(item) {
  const value = item?.updatedAt || item?.updatedat || "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function itemSnapshot(item) {
  if (!item) return null;
  return JSON.stringify({
    id: item.id,
    name: item.name,
    code: item.code,
    category: item.category,
    unit: item.unit,
    stock: Number(item.stock ?? 0),
    threshold: Number(item.threshold ?? 0),
    price: Number(item.price ?? 0),
    minStock: item.minStock ?? null,
    maxStock: item.maxStock ?? null
  });
}

function sameInventoryItem(left, right) {
  return itemSnapshot(left) === itemSnapshot(right);
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
  const [deletedInventoryIds, setDeletedInventoryIds] = useState(() => new Set(readStoredDeletedInventoryIds()));
  const [inventoryState, setInventoryState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return filterDeletedInventory(parsed, readStoredDeletedInventoryIds());
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
  const lastSyncedInventoryRef = useRef(readStoredInventorySnapshot());
  const inventoryStateRef = useRef(inventoryState);
  const deletedInventoryIdsRef = useRef(deletedInventoryIds);
  const conflictResolutionRef = useRef(new Map());
  const conflictPayloadRef = useRef(new Map());
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    inventoryStateRef.current = inventoryState;
  }, [inventoryState]);

  useEffect(() => {
    deletedInventoryIdsRef.current = deletedInventoryIds;
  }, [deletedInventoryIds]);

  const syncInventory = useCallback(
    async (previousItems, nextItems) => {
      if (!hasSupabaseConfig || !supabase || !remoteLoadedRef.current) return false;

      try {
        const { data: remoteData, error: loadError } = await supabase
          .from(INVENTORY_TABLE)
          .select("*")
          .order("id", { ascending: true });

        if (loadError) throw loadError;

        const baseItems = normalizeInventory(previousItems);
        const localItems = normalizeInventory(nextItems);
        const remoteItems = normalizeInventory(remoteData);
        const deletedIds = deletedInventoryIdsRef.current || new Set();

        const baseById = new Map(baseItems.map((item) => [String(item.id), item]));
        const localById = new Map(localItems.map((item) => [String(item.id), item]));
        const remoteById = new Map(remoteItems.map((item) => [String(item.id), item]));
        const allIds = new Set([
          ...baseById.keys(),
          ...localById.keys(),
          ...remoteById.keys()
        ]);

        const resolvedLocalItems = [];
        const resolvedRemoteItems = [];
        const upsertRows = [];
        const removedIds = [];
        const conflictIds = [];
        const resolvedConflictIds = [];

        for (const id of allIds) {
          if (deletedIds.has(id)) {
            if (remoteById.has(id)) {
              removedIds.push(id);
            }
            continue;
          }

          const baseItem = baseById.get(id) || null;
          const localItem = localById.get(id) || null;
          const remoteItem = remoteById.get(id) || null;
          const localChanged = !sameInventoryItem(localItem, baseItem);
          const remoteChanged = !sameInventoryItem(remoteItem, baseItem);
          const conflictKey = `inventory-conflict-${id}`;
          const forcedResolution = conflictResolutionRef.current.get(id) || "";

          if (forcedResolution === "remote") {
            if (remoteItem) {
              resolvedLocalItems.push(remoteItem);
              resolvedRemoteItems.push(remoteItem);
              upsertRows.push(toInventoryRow(remoteItem));
            } else {
              removedIds.push(id);
            }
            resolvedConflictIds.push(id);
            conflictResolutionRef.current.delete(id);
            continue;
          }

          if (forcedResolution === "local") {
            if (localItem) {
              resolvedLocalItems.push(localItem);
              resolvedRemoteItems.push(localItem);
              upsertRows.push(toInventoryRow(localItem));
            } else {
              removedIds.push(id);
            }
            resolvedConflictIds.push(id);
            conflictResolutionRef.current.delete(id);
            continue;
          }

          if (localChanged && remoteChanged && !sameInventoryItem(localItem, remoteItem)) {
            const localWins = getInventoryTimestamp(localItem) >= getInventoryTimestamp(remoteItem);
            const chosen = localWins ? localItem : remoteItem;
            conflictPayloadRef.current.set(conflictKey, {
              itemId: id,
              payload: {
                baseItem,
                localItem,
                remoteItem
              }
            });

            conflictIds.push(id);

            if (chosen) {
              resolvedLocalItems.push(chosen);
              resolvedRemoteItems.push(chosen);
              upsertRows.push(toInventoryRow(chosen));
            } else {
              removedIds.push(id);
            }
            continue;
          }

          if (localItem && !remoteChanged) {
            resolvedLocalItems.push(localItem);
            resolvedRemoteItems.push(localItem);
            if (!sameInventoryItem(localItem, baseItem)) {
              upsertRows.push(toInventoryRow(localItem));
            }
            continue;
          }

          if (!localItem && remoteItem && !localChanged) {
            resolvedLocalItems.push(remoteItem);
            resolvedRemoteItems.push(remoteItem);
            continue;
          }

          if (!localItem && remoteItem && remoteChanged) {
            resolvedLocalItems.push(remoteItem);
            resolvedRemoteItems.push(remoteItem);
            continue;
          }

          if (localItem && !remoteItem && !localChanged) {
            removedIds.push(id);
            continue;
          }

          if (localItem && !remoteItem && localChanged) {
            resolvedLocalItems.push(localItem);
            resolvedRemoteItems.push(localItem);
            upsertRows.push(toInventoryRow(localItem));
            continue;
          }

          if (remoteItem) {
            resolvedLocalItems.push(remoteItem);
            resolvedRemoteItems.push(remoteItem);
          } else if (localItem) {
            resolvedLocalItems.push(localItem);
            resolvedRemoteItems.push(localItem);
          }
        }

        if (removedIds.length > 0) {
          const { error: deleteError } = await supabase
            .from(INVENTORY_TABLE)
            .delete()
            .in("id", removedIds);

          if (deleteError) throw deleteError;
        }

        if (upsertRows.length > 0) {
          const { error: upsertError } = await supabase
            .from(INVENTORY_TABLE)
            .upsert(upsertRows, { onConflict: "id" });

          if (upsertError) throw upsertError;
        }

        const finalSnapshot =
          resolvedRemoteItems.length > 0
            ? resequenceItemCodes(normalizeInventory(resolvedRemoteItems))
            : [];

        if (removedIds.length > 0) {
          setDeletedInventoryIds((current) => {
            const next = new Set(current);
            removedIds.forEach((id) => next.add(String(id)));
            return next;
          });
        }

        lastSyncedInventoryRef.current = finalSnapshot;
        localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(finalSnapshot));
        resolvedConflictIds.forEach((id) => {
          conflictPayloadRef.current.delete(`inventory-conflict-${id}`);
        });
        conflictIds.forEach((id) => {
          if (!resolvedConflictIds.includes(id)) {
            conflictPayloadRef.current.delete(`inventory-conflict-${id}`);
          }
        });

        const nextState =
          resolvedLocalItems.length > 0
            ? resequenceItemCodes(normalizeInventory(resolvedLocalItems))
            : [];
        if (!sameInventoryItemArray(nextState, inventoryStateRef.current)) {
          setInventoryState(nextState);
        }

        if (conflictIds.length > 0) {
          setInventorySyncError(
            `Inventory synced with ${conflictIds.length} conflict${conflictIds.length === 1 ? "" : "s"} left for review.`
          );
        } else {
          setInventorySyncError("");
        }

        return conflictIds.length === 0;
      } catch (error) {
        console.error("Inventory sync failed:", error);
        setInventorySyncError(
          `Inventory changes were saved locally, but Supabase sync failed for "${INVENTORY_TABLE}". ${error?.message || "Check the browser console for the Supabase error."}`
        );
        return false;
      }
    },
    [inventoryStateRef]
  );

  function sameInventoryItemArray(left, right) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!sameInventoryItem(left[index], right[index])) return false;
    }
    return true;
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventoryState));
  }, [inventoryState]);

  useEffect(() => {
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify([...deletedInventoryIds].sort()));
  }, [deletedInventoryIds]);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(inventoryHistoryState));
  }, [inventoryHistoryState]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
        const mergedSnapshot = mergeInventorySnapshots(
          normalized,
          inventoryStateRef.current || [],
          deletedInventoryIdsRef.current || []
        );
        const schemaVersion = Number(localStorage.getItem(ITEM_CODE_SCHEMA_KEY) || "0");
        const nextItems =
          schemaVersion >= ITEM_CODE_SCHEMA_VERSION
            ? mergedSnapshot
            : resequenceItemCodes(mergedSnapshot);

        setInventoryState(nextItems);
        setInventorySyncError("");
        lastSyncedInventoryRef.current = normalized;
        localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(normalized));

        if (schemaVersion < ITEM_CODE_SCHEMA_VERSION) {
          localStorage.setItem(ITEM_CODE_SCHEMA_KEY, String(ITEM_CODE_SCHEMA_VERSION));
          remoteLoadedRef.current = true;
          void syncInventory(normalized, nextItems);
          setIsLoadingInventory(false);
          return;
        }

        if (normalized.some((item) => deletedInventoryIdsRef.current.has(String(item.id)))) {
          remoteLoadedRef.current = true;
          void syncInventory(normalized, nextItems);
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

  const flushInventorySync = useCallback(() => {
    if (!remoteLoadedRef.current || !hasSupabaseConfig || !supabase || !isOnline) return;

    const lastSyncedSnapshot = lastSyncedInventoryRef.current || [];
    const currentSnapshot = inventoryStateRef.current || [];
    if (JSON.stringify(lastSyncedSnapshot) === JSON.stringify(currentSnapshot)) return;

    return syncInventory(lastSyncedSnapshot, currentSnapshot);
  }, [isOnline, syncInventory]);

  const flushQueuedInventoryAuditLogs = useCallback(() => {
    if (!hasSupabaseConfig || !supabase || !isOnline) return;

    void flushQueuedAuditLogs({
      getAccessToken: async () => {
        const { data } = await supabase.auth.getSession();
        return data?.session?.access_token || "";
      }
    });
  }, [isOnline]);

  const recordInventoryAuditLogs = useCallback(
    (entries) => {
      queueAuditLogs(entries);
      flushQueuedInventoryAuditLogs();
    },
    [flushQueuedInventoryAuditLogs]
  );

  const setInventory = useCallback(
    (value) => {
      setInventoryState((current) => {
        const nextItems = typeof value === "function" ? value(current) : value;
        const normalizedNext = normalizeInventory(nextItems);
        const deletedIds = current
          .filter((item) => !normalizedNext.some((nextItem) => String(nextItem.id) === String(item.id)))
          .map((item) => String(item.id));
        const historyEntries = buildInventoryAuditEntries(current, normalizedNext);

        if (deletedIds.length > 0) {
          setDeletedInventoryIds((currentIds) => {
            const nextIds = new Set(currentIds);
            deletedIds.forEach((id) => nextIds.add(id));
            return nextIds;
          });
        }

        if (historyEntries.length > 0) {
          setInventoryHistoryState((history) => [
            ...historyEntries,
            ...history
          ].slice(0, HISTORY_LIMIT));

          const auditEntries = buildInventoryAuditLogs(current, normalizedNext, {
            source: "browser"
          });
          if (auditEntries.length > 0) {
            recordInventoryAuditLogs(auditEntries);
          }
        }

        if (remoteLoadedRef.current && isOnline) {
          void syncInventory(current, normalizedNext);
        }

        return normalizedNext;
      });
    },
    [isOnline, recordInventoryAuditLogs, syncInventory]
  );

  const resolveInventoryConflict = useCallback(
    (itemId, resolution) => {
      const conflictKey = `inventory-conflict-${String(itemId)}`;
      const conflictEntry = conflictPayloadRef.current.get(conflictKey) || null;

      if (!conflictEntry || !conflictEntry.payload) return false;

      const { localItem, remoteItem } = conflictEntry.payload;

      if (resolution === "remote") {
        conflictResolutionRef.current.set(String(itemId), "remote");
        if (remoteItem) {
          setInventoryState((current) =>
            current.map((item) => (String(item.id) === String(itemId) ? remoteItem : item))
          );
        }
      } else {
        conflictResolutionRef.current.set(String(itemId), "local");
      }

      conflictPayloadRef.current.delete(conflictKey);
      flushInventorySync();
      return Boolean(localItem || remoteItem);
    },
    [flushInventorySync]
  );

  const value = useMemo(() => {
    return {
      inventory: inventoryState,
      inventoryHistory: inventoryHistoryState,
      setInventory,
      retryInventorySync: flushInventorySync,
      resolveInventoryConflict,
      isLoadingInventory,
      inventorySyncError
    };
  }, [
    inventoryState,
    inventoryHistoryState,
    setInventory,
    flushInventorySync,
    resolveInventoryConflict,
    isLoadingInventory,
    inventorySyncError
  ]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error("useInventory must be used within an InventoryProvider");
  }
  return ctx;
}
