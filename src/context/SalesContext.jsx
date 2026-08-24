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
import { useInventory } from "./InventoryContext";
import { BRANCH_OPTIONS } from "../data/branches";
import {
  normalizeSaleDateValue
} from "../utils/salesDates";
import {
  getSaleInventoryQuantity,
  isSiomaiItem,
  roundSiomaiQuantity
} from "../utils/siomaiUnits";

const SalesContext = createContext(null);
const STORAGE_KEY = "smart_inventory_sales";
const CORRECTIONS_KEY = "smart_inventory_sale_corrections";
const LAST_SYNC_KEY = "smart_inventory_sales_last_synced";
const DELETED_IDS_KEY = "smart_inventory_sales_deleted_ids";
const SALES_TABLE = import.meta.env.VITE_SUPABASE_SALES_TABLE || "sales_records";
const SALE_BRANCH_PREFIX = "__smart_inventory_branch__:";
const hasSupabaseConfig =
  Boolean(import.meta.env.VITE_SUPABASE_URL) && Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

function encodeSaleNotes(branch, notes) {
  const cleanBranch = typeof branch === "string" ? branch.trim() : "";
  const cleanNotes = typeof notes === "string" ? notes.trim() : "";

  if (!cleanBranch) return cleanNotes;

  const prefix = `${SALE_BRANCH_PREFIX}${encodeURIComponent(cleanBranch)}`;
  return cleanNotes ? `${prefix}\n${cleanNotes}` : prefix;
}

function decodeSaleNotes(notes) {
  const text = typeof notes === "string" ? notes : "";
  if (!text.startsWith(SALE_BRANCH_PREFIX)) {
    return { branch: "", notes: text };
  }

  const remainder = text.slice(SALE_BRANCH_PREFIX.length);
  const newlineIndex = remainder.indexOf("\n");
  const branchToken = newlineIndex >= 0 ? remainder.slice(0, newlineIndex) : remainder;
  const cleanedNotes = newlineIndex >= 0 ? remainder.slice(newlineIndex + 1) : "";

  try {
    return {
      branch: decodeURIComponent(branchToken),
      notes: cleanedNotes
    };
  } catch {
    return {
      branch: branchToken,
      notes: cleanedNotes
    };
  }
}

function normalizeSale(sale) {
  if (!sale || typeof sale !== "object") return null;

  const id = sale.id ?? sale.sale_id ?? `sale-${Date.now()}`;
  const inventoryItemId =
    sale.inventoryItemId ?? sale.inventory_item_id ?? sale.inventory_itemid ?? null;
  const decodedNotes = decodeSaleNotes(
    typeof sale.notes === "string" ? sale.notes : typeof sale.note === "string" ? sale.note : ""
  );
  const branchValue = sale.branch ?? sale.branch_name ?? decodedNotes.branch;

  return {
    ...sale,
    id: typeof id === "string" ? id : String(id),
    date: normalizeSaleDateValue(
      sale.date ?? sale.sale_date ?? sale.recorded_at ?? sale.createdAt ?? sale.created_at
    ),
    product: typeof sale.product === "string" ? sale.product : "",
    qty: Number(sale.qty ?? 0),
    price: Number(sale.price ?? 0),
    notes: decodedNotes.notes,
    branch:
      BRANCH_OPTIONS.some((option) => option.value === branchValue)
        ? branchValue
        : typeof branchValue === "string"
        ? branchValue.trim()
        : "",
    inventoryItemId:
      inventoryItemId === null || inventoryItemId === undefined ? undefined : Number(inventoryItemId),
    inventoryItemName:
      typeof sale.inventoryItemName === "string"
        ? sale.inventoryItemName
        : typeof sale.inventory_item_name === "string"
        ? sale.inventory_item_name
        : "",
    inventoryQty: sale.inventoryQty ?? sale.inventory_qty ?? sale.inventoryqty ?? undefined,
    createdAt:
      typeof sale.createdAt === "string"
        ? sale.createdAt
        : typeof sale.created_at === "string"
        ? sale.created_at
        : ""
  };
}

function normalizeSales(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeSale).filter(Boolean);
}

function normalizeSaleIdList(items) {
  if (!Array.isArray(items)) return [];

  return [...new Set(items.map((item) => (typeof item === "string" ? item : String(item))).filter(Boolean))];
}

function readStoredDeletedSaleIds() {
  const stored = localStorage.getItem(DELETED_IDS_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return normalizeSaleIdList(parsed);
  } catch {
    return [];
  }
}

function filterDeletedSales(items, deletedIds) {
  if (!Array.isArray(items) || deletedIds.size === 0) return normalizeSales(items);

  return normalizeSales(items).filter((sale) => !deletedIds.has(String(sale.id)));
}

function getSaleSortTime(sale) {
  const value = sale?.createdAt || sale?.date || "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeSalesSnapshots(remoteItems, localItems) {
  const mergedById = new Map();

  [...normalizeSales(remoteItems), ...normalizeSales(localItems)].forEach((sale) => {
    mergedById.set(String(sale.id), sale);
  });

  return [...mergedById.values()].sort((a, b) => getSaleSortTime(b) - getSaleSortTime(a));
}

function sortSalesDescending(items) {
  return [...items].sort((a, b) => getSaleSortTime(b) - getSaleSortTime(a));
}

function readStoredSalesSnapshot() {
  const stored = localStorage.getItem(LAST_SYNC_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? normalizeSales(parsed) : [];
  } catch {
    return [];
  }
}

function normalizeCorrection(correction) {
  if (!correction || typeof correction !== "object") return null;

  const id = correction.id ?? correction.correctionId ?? `correction-${Date.now()}`;
  const saleId = correction.saleId ?? correction.sale_id ?? "";

  return {
    id: typeof id === "string" ? id : String(id),
    saleId: typeof saleId === "string" ? saleId : String(saleId),
    branch: typeof correction.branch === "string" ? correction.branch.trim() : "",
    product: typeof correction.product === "string" ? correction.product.trim() : "",
    qty: Number(correction.qty ?? 0),
    reason: typeof correction.reason === "string" ? correction.reason.trim() : "",
    previousProduct:
      typeof correction.previousProduct === "string" ? correction.previousProduct.trim() : "",
    previousQty: Number(correction.previousQty ?? 0),
    correctedProduct:
      typeof correction.correctedProduct === "string" ? correction.correctedProduct.trim() : "",
    correctedQty: Number(correction.correctedQty ?? 0),
    createdAt:
      typeof correction.createdAt === "string"
        ? correction.createdAt
        : typeof correction.created_at === "string"
        ? correction.created_at
        : ""
  };
}

function normalizeCorrections(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeCorrection).filter(Boolean);
}

function getInventoryQuantity(sale) {
  const inventoryQty = Number(sale?.inventoryQty);
  const qty = Number(sale?.qty) || 0;
  const itemName = sale?.inventoryItemName || sale?.product;

  if (Number.isFinite(inventoryQty)) {
    if (
      isSiomaiItem(itemName) &&
      Number.isInteger(inventoryQty) &&
      Number.isInteger(qty) &&
      inventoryQty === qty
    ) {
      return getSaleInventoryQuantity(itemName, qty);
    }

    return isSiomaiItem(itemName) ? roundSiomaiQuantity(inventoryQty, itemName) : inventoryQty;
  }

  return getSaleInventoryQuantity(itemName, qty);
}

function buildInventoryDeltaMap(sales) {
  const deltas = new Map();

  sales.forEach((sale) => {
    const inventoryItemId = sale?.inventoryItemId ?? null;
    const inventoryQty = getInventoryQuantity(sale);
    if (!inventoryItemId || inventoryQty <= 0) return;

    const key = String(inventoryItemId);
    deltas.set(key, (deltas.get(key) || 0) + inventoryQty);
  });

  return deltas;
}

function toSalesRow(sale) {
  return {
    id: sale.id,
    date: normalizeSaleDateValue(sale.date),
    product: sale.product,
    qty: Number(sale.qty || 0),
    price: Number(sale.price || 0),
    notes: encodeSaleNotes(sale.branch, sale.notes),
    inventory_item_id:
      sale.inventoryItemId === undefined || sale.inventoryItemId === null
        ? null
        : Number(sale.inventoryItemId),
    inventory_item_name: sale.inventoryItemName || null,
    inventory_qty:
      sale.inventoryQty === undefined || sale.inventoryQty === null
        ? null
        : Number(sale.inventoryQty),
    created_at: typeof sale.createdAt === "string" && sale.createdAt ? sale.createdAt : new Date().toISOString()
  };
}

function normalizeSaleForStorage(sale) {
  const normalized = normalizeSale(sale);
  if (!normalized) return null;

  return {
    ...normalized,
    branch: typeof normalized.branch === "string" ? normalized.branch.trim() : "",
    inventoryQty: getInventoryQuantity(normalized) || undefined
  };
}

export function SalesProvider({ children }) {
  const { setInventory, retryInventorySync, inventorySyncError } = useInventory();
  const [extraSalesState, setExtraSalesState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return normalizeSales(parsed);
        }
      } catch {
        // Ignore invalid storage and fall back to empty list.
      }
    }
    return [];
  });
  const [saleCorrections, setSaleCorrections] = useState(() => {
    const stored = localStorage.getItem(CORRECTIONS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return normalizeCorrections(parsed);
        }
      } catch {
        // Ignore invalid correction storage and fall back to empty list.
      }
    }
    return [];
  });
  const [deletedSaleIds, setDeletedSaleIds] = useState(() => new Set(readStoredDeletedSaleIds()));
  const [isLoadingSales, setIsLoadingSales] = useState(hasSupabaseConfig);
  const [salesSyncError, setSalesSyncError] = useState("");
  const remoteLoadedRef = useRef(false);
  const lastSyncedSalesRef = useRef(readStoredSalesSnapshot());
  const syncRetryTimerRef = useRef(null);
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  const applyRemoteSalesSnapshot = useCallback((items) => {
    const normalizedRemote = filterDeletedSales(items, deletedSaleIds);
    setExtraSalesState((current) => mergeSalesSnapshots(normalizedRemote, current));
    lastSyncedSalesRef.current = normalizedRemote;
    localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(normalizedRemote));
  }, [deletedSaleIds]);

  const syncSales = useCallback(
    async (previousItems, nextItems) => {
      if (!hasSupabaseConfig || !supabase || !remoteLoadedRef.current) return;

      const nextById = new Map(nextItems.map((sale) => [String(sale.id), sale]));
      const removedIds = previousItems
        .filter((sale) => !nextById.has(String(sale.id)))
        .map((sale) => sale.id);

      try {
        if (removedIds.length > 0) {
          const { error: deleteError } = await supabase.from(SALES_TABLE).delete().in("id", removedIds);
          if (deleteError) throw deleteError;
        }

        if (nextItems.length > 0) {
          const rows = nextItems.map(toSalesRow);
          const { error: upsertError } = await supabase
            .from(SALES_TABLE)
            .upsert(rows, { onConflict: "id" });

          if (upsertError) throw upsertError;
        }

        lastSyncedSalesRef.current = nextItems;
        localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(nextItems));
        if (removedIds.length > 0) {
          setDeletedSaleIds((current) => {
            const nextIds = new Set(current);
            removedIds.forEach((id) => nextIds.delete(String(id)));
            return nextIds;
          });
        }
        setSalesSyncError("");
      } catch (error) {
        console.error("Sales sync failed:", error);
        setSalesSyncError(
          `Sales changes were saved locally, but Supabase sync failed for "${SALES_TABLE}". ${error?.message || ""}`.trim()
        );
      }
    },
    []
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(extraSalesState));
  }, [extraSalesState]);

  useEffect(() => {
    localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(saleCorrections));
  }, [saleCorrections]);

  useEffect(() => {
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify([...deletedSaleIds]));
  }, [deletedSaleIds]);

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

    async function loadSales() {
      if (!hasSupabaseConfig || !supabase) {
        setIsLoadingSales(false);
        remoteLoadedRef.current = true;
        return;
      }

      const { data, error } = await supabase
        .from(SALES_TABLE)
        .select("*")
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (error) {
        const detail = error.message || error.code || "Unknown Supabase error";
        setSalesSyncError(
          `Using local sales cache because Supabase could not load "${SALES_TABLE}". ${detail}`
        );
        setIsLoadingSales(false);
        remoteLoadedRef.current = true;
        return;
      }

      if (Array.isArray(data)) {
        const normalizedRemote = filterDeletedSales(data, deletedSaleIds);
        setExtraSalesState((current) => {
          const merged = mergeSalesSnapshots(normalizedRemote, current);
          if (JSON.stringify(merged) !== JSON.stringify(normalizedRemote)) {
            remoteLoadedRef.current = true;
            void syncSales(normalizedRemote, merged);
          }
          return merged;
        });
        lastSyncedSalesRef.current = normalizedRemote;
        localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(normalizedRemote));
        setSalesSyncError("");
      }

      setIsLoadingSales(false);
      remoteLoadedRef.current = true;
    }

    loadSales();

    return () => {
      isMounted = false;
    };
  }, [applyRemoteSalesSnapshot, deletedSaleIds, syncSales]);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) return undefined;

    const channel = supabase
      .channel(`sales-records-${SALES_TABLE}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: SALES_TABLE },
        async () => {
          if (!isOnline) return;

          try {
            const { data, error } = await supabase
              .from(SALES_TABLE)
              .select("*")
              .order("created_at", { ascending: false });

            if (error) throw error;
            if (Array.isArray(data)) {
              applyRemoteSalesSnapshot(data);
              setSalesSyncError("");
            }
          } catch (error) {
            setSalesSyncError(
              `Sales database updates could not be refreshed from "${SALES_TABLE}". ${error?.message || ""}`.trim()
            );
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyRemoteSalesSnapshot, isOnline]);

  const adjustInventoryForSales = useCallback(
    (sales, direction) => {
      const deltas = buildInventoryDeltaMap(sales);
      if (deltas.size === 0) return;

      setInventory((prev) =>
        prev.map((item) => {
          const delta = deltas.get(String(item.id));
          if (!delta) return item;

          const nextStock = Number(item.stock || 0) + direction * delta;
          const normalizedStock = isSiomaiItem(item.name)
            ? roundSiomaiQuantity(nextStock, item.name)
            : Math.max(0, nextStock);

          return {
            ...item,
            stock: normalizedStock
          };
        })
      );
    },
    [setInventory]
  );

  const setExtraSales = useCallback(
    (value) => {
      setExtraSalesState((current) => {
        const nextItems = typeof value === "function" ? value(current) : value;
        return normalizeSales(nextItems);
      });
    },
    []
  );

  const retrySalesSync = useCallback(() => {
    if (!remoteLoadedRef.current || !hasSupabaseConfig || !supabase) return;

    const lastSyncedSnapshot = lastSyncedSalesRef.current || [];
    const currentSnapshot = normalizeSales(extraSalesState);
    if (JSON.stringify(lastSyncedSnapshot) === JSON.stringify(currentSnapshot)) return;

    return syncSales(lastSyncedSnapshot, currentSnapshot);
  }, [extraSalesState, syncSales]);

  const scheduleConsistencyRetry = useCallback(() => {
    if (!hasSupabaseConfig || !supabase || !isOnline || !remoteLoadedRef.current) return;

    if (syncRetryTimerRef.current) {
      clearTimeout(syncRetryTimerRef.current);
    }

    syncRetryTimerRef.current = setTimeout(() => {
      void retryInventorySync?.();
      void retrySalesSync();
    }, 250);
  }, [isOnline, retryInventorySync, retrySalesSync]);

  useEffect(() => {
    if (!isOnline || !remoteLoadedRef.current) return undefined;
    if (!salesSyncError && !inventorySyncError) return undefined;

    scheduleConsistencyRetry();
    return undefined;
  }, [inventorySyncError, isOnline, salesSyncError, scheduleConsistencyRetry]);

  useEffect(() => {
    return () => {
      if (syncRetryTimerRef.current) {
        clearTimeout(syncRetryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!remoteLoadedRef.current || !hasSupabaseConfig || !supabase || !isOnline) return;

    const lastSyncedSnapshot = lastSyncedSalesRef.current || [];
    if (JSON.stringify(lastSyncedSnapshot) === JSON.stringify(extraSalesState)) return;

    void syncSales(lastSyncedSnapshot, extraSalesState);
  }, [extraSalesState, isOnline, syncSales]);

  const salesHistory = useMemo(() => {
    return sortSalesDescending(extraSalesState);
  }, [extraSalesState]);

  const totalRevenue = useMemo(() => {
    return salesHistory.reduce((sum, sale) => {
      const qty = Number(sale.qty) || 0;
      const price = Number(sale.price) || 0;
      return sum + qty * price;
    }, 0);
  }, [salesHistory]);

  const addSalesBatch = useCallback(
    (sales) => {
      if (!Array.isArray(sales) || sales.length === 0) return;

      const normalizedSales = sales.map(normalizeSaleForStorage).filter(Boolean);
      if (normalizedSales.length === 0) return;

      adjustInventoryForSales(normalizedSales, -1);

      setExtraSales((prev) => {
        const batchItems = normalizedSales.map((sale) => ({
          ...sale,
          id: sale.id ?? (globalThis.crypto?.randomUUID?.() ?? `sale-${Date.now()}`),
          branch: typeof sale.branch === "string" ? sale.branch.trim() : "",
          inventoryQty: getInventoryQuantity(sale) || undefined
        }));

        return [...batchItems, ...prev];
      });

      scheduleConsistencyRetry();
    },
    [adjustInventoryForSales, scheduleConsistencyRetry, setExtraSales]
  );

  const addSale = useCallback(
    (sale) => {
      addSalesBatch([sale]);
    },
    [addSalesBatch]
  );

  const clearRecordedSales = useCallback(() => {
    adjustInventoryForSales(extraSalesState, 1);
    setExtraSales([]);
    scheduleConsistencyRetry();
  }, [adjustInventoryForSales, extraSalesState, scheduleConsistencyRetry, setExtraSales]);

  const deleteSaleRecord = useCallback(
    (saleId) => {
      let removedSale = null;
      const normalizedSaleId = String(saleId);
      setDeletedSaleIds((current) => {
        const nextIds = new Set(current);
        nextIds.add(normalizedSaleId);
        return nextIds;
      });
      setExtraSales((prev) =>
        prev.filter((sale) => {
          if (String(sale.id) !== normalizedSaleId) return true;
          removedSale = sale;
          return false;
        })
      );

      if (removedSale) {
        adjustInventoryForSales([removedSale], 1);
        scheduleConsistencyRetry();
      }
    },
    [adjustInventoryForSales, scheduleConsistencyRetry, setExtraSales]
  );

  const undoLastSale = useCallback(
    (branch = "") => {
      let removedSale = null;
      const normalizedBranch = typeof branch === "string" ? branch.trim() : "";

      setExtraSales((prev) => {
        if (prev.length === 0) return prev;

        const targetIndex = normalizedBranch
          ? prev.findIndex((sale) => (sale.branch || "").trim() === normalizedBranch)
          : 0;

        if (targetIndex < 0 || targetIndex >= prev.length) return prev;

        removedSale = prev[targetIndex];
        return [...prev.slice(0, targetIndex), ...prev.slice(targetIndex + 1)];
      });

      if (removedSale) {
        adjustInventoryForSales([removedSale], 1);
        scheduleConsistencyRetry();
      }
    },
    [adjustInventoryForSales, scheduleConsistencyRetry, setExtraSales]
  );

  const voidLastSale = useCallback(
    (branch = "", reason = "") => {
      let removedSale = null;
      const normalizedBranch = typeof branch === "string" ? branch.trim() : "";
      const normalizedReason = typeof reason === "string" ? reason.trim() : "";

      if (!normalizedReason) {
        return null;
      }

      setExtraSales((prev) => {
        if (prev.length === 0) return prev;

        const targetIndex = normalizedBranch
          ? prev.findIndex((sale) => (sale.branch || "").trim() === normalizedBranch)
          : 0;

        if (targetIndex < 0 || targetIndex >= prev.length) return prev;

        removedSale = prev[targetIndex];
        return [...prev.slice(0, targetIndex), ...prev.slice(targetIndex + 1)];
      });

      if (removedSale) {
        adjustInventoryForSales([removedSale], 1);
        setSaleCorrections((current) => [
          {
            id:
              globalThis.crypto?.randomUUID?.() ??
              `correction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            saleId: removedSale.id,
            branch: removedSale.branch || normalizedBranch,
            product: removedSale.product || "",
            qty: Number(removedSale.qty || 0),
            reason: normalizedReason,
            createdAt: new Date().toISOString()
          },
          ...current
        ]);
        scheduleConsistencyRetry();
      }

      return removedSale;
    },
    [adjustInventoryForSales, scheduleConsistencyRetry, setExtraSales]
  );

  const correctSaleRecord = useCallback(
    (saleId, updates = {}, reason = "") => {
      let previousSale = null;
      let correctedSale = null;
      const normalizedReason = typeof reason === "string" ? reason.trim() : "";

      if (!normalizedReason) {
        return null;
      }

      setExtraSales((prev) => {
        const targetIndex = prev.findIndex((sale) => sale.id === saleId);
        if (targetIndex < 0) return prev;

        previousSale = prev[targetIndex];
        correctedSale = normalizeSaleForStorage({
          ...previousSale,
          ...updates,
          id: previousSale.id,
          branch: previousSale.branch,
          date: previousSale.date,
          notes: previousSale.notes,
          createdAt: previousSale.createdAt
        });

        if (!correctedSale) return prev;

        const nextItems = [...prev];
        nextItems[targetIndex] = {
          ...correctedSale,
          id: previousSale.id,
          branch: previousSale.branch,
          date: previousSale.date,
          notes: previousSale.notes,
          createdAt: previousSale.createdAt
        };

        return nextItems;
      });

      if (previousSale && correctedSale) {
        adjustInventoryForSales([previousSale], 1);
        adjustInventoryForSales([correctedSale], -1);
        setSaleCorrections((current) => [
          {
            id:
              globalThis.crypto?.randomUUID?.() ??
              `correction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            saleId: previousSale.id,
            branch: previousSale.branch || correctedSale.branch || "",
            product: correctedSale.product || "",
            qty: Number(correctedSale.qty || 0),
            reason: normalizedReason,
            previousProduct: previousSale.product || "",
            previousQty: Number(previousSale.qty || 0),
            correctedProduct: correctedSale.product || "",
            correctedQty: Number(correctedSale.qty || 0),
            createdAt: new Date().toISOString()
          },
          ...current
        ]);
        scheduleConsistencyRetry();
      }

      return correctedSale;
    },
    [adjustInventoryForSales, scheduleConsistencyRetry, setExtraSales]
  );

  const value = useMemo(() => {
    return {
      salesHistory,
      addSale,
      addSalesBatch,
      clearRecordedSales,
      deleteSaleRecord,
      undoLastSale,
      voidLastSale,
      correctSaleRecord,
      saleCorrections,
      totalRevenue,
      isLoadingSales,
      salesSyncError,
      retrySalesSync
    };
  }, [
    salesHistory,
    addSale,
    addSalesBatch,
    clearRecordedSales,
    deleteSaleRecord,
    undoLastSale,
    voidLastSale,
    correctSaleRecord,
    saleCorrections,
    totalRevenue,
    isLoadingSales,
    salesSyncError,
    retrySalesSync
  ]);

  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
}

export function useSales() {
  const ctx = useContext(SalesContext);
  if (!ctx) {
    throw new Error("useSales must be used within a SalesProvider");
  }
  return ctx;
}
