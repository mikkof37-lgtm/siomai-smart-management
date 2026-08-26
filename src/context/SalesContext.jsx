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
import {
  buildSaleAuditLog,
  buildSaleBatchAuditLogs,
  queueAuditLogs,
  flushQueuedAuditLogs
} from "../utils/auditTrail";

const SalesContext = createContext(null);
const STORAGE_KEY = "smart_inventory_sales";
const CORRECTIONS_KEY = "smart_inventory_sale_corrections";
const LAST_SYNC_KEY = "smart_inventory_sales_last_synced";
const DELETED_IDS_KEY = "smart_inventory_sales_deleted_ids";
const SALES_TABLE = import.meta.env.VITE_SUPABASE_SALES_TABLE || "sales_records";
const SALE_BRANCH_PREFIX = "__smart_inventory_branch__:";
const hasSupabaseConfig =
  Boolean(import.meta.env.VITE_SUPABASE_URL) && Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

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
    setExtraSalesState(normalizedRemote);
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
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token || "";
        if (!accessToken) {
          throw new Error("Unable to authenticate the sales sync request.");
        }

        const response = await fetch("/api/sales-sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            previousItems: previousItems.map(normalizeSaleForStorage).filter(Boolean),
            nextItems: nextItems.map(normalizeSaleForStorage).filter(Boolean)
          })
        });

        const responseText = await response.text();
        let payload = {};
        try {
          payload = responseText ? JSON.parse(responseText) : {};
        } catch {
          payload = { detail: responseText };
        }

        if (!response.ok) {
          throw new Error(payload?.detail || payload?.error || "Sales sync failed.");
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
        setExtraSalesState(normalizedRemote);
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

  const flushQueuedSaleAuditLogs = useCallback(() => {
    if (!hasSupabaseConfig || !supabase || !isOnline) return;

    void flushQueuedAuditLogs({
      getAccessToken: async () => {
        const { data } = await supabase.auth.getSession();
        return data?.session?.access_token || "";
      }
    });
  }, [isOnline]);

  const recordSaleAuditLogs = useCallback(
    (entries) => {
      queueAuditLogs(entries);
      flushQueuedSaleAuditLogs();
    },
    [flushQueuedSaleAuditLogs]
  );

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
      recordSaleAuditLogs(buildSaleBatchAuditLogs(normalizedSales, { source: "browser" }));

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
    [adjustInventoryForSales, recordSaleAuditLogs, scheduleConsistencyRetry, setExtraSales]
  );

  const addSale = useCallback(
    (sale) => {
      addSalesBatch([sale]);
    },
    [addSalesBatch]
  );

  const clearRecordedSales = useCallback(() => {
    if (extraSalesState.length > 0) {
      recordSaleAuditLogs([
        buildSaleAuditLog({
          action: "cleared",
          beforeSale: extraSalesState,
          afterSale: [],
          branch: "all branches",
          source: "browser",
          metadata: {
            summary: "Cleared recorded sales.",
            details: `Removed ${extraSalesState.length} sale record${extraSalesState.length === 1 ? "" : "s"}.`
          }
        })
      ]);
    }
    adjustInventoryForSales(extraSalesState, 1);
    setExtraSales([]);
    scheduleConsistencyRetry();
  }, [
    adjustInventoryForSales,
    extraSalesState,
    recordSaleAuditLogs,
    scheduleConsistencyRetry,
    setExtraSales
  ]);

  const deleteSaleRecord = useCallback(
    (saleId) => {
      const normalizedSaleId = String(saleId);
      const currentSnapshot = normalizeSales(extraSalesState);
      const removedSale = currentSnapshot.find((sale) => String(sale.id) === normalizedSaleId) || null;
      const nextSnapshot = currentSnapshot.filter((sale) => String(sale.id) !== normalizedSaleId);

      if (!removedSale) {
        setDeletedSaleIds((current) => {
          const nextIds = new Set(current);
          nextIds.add(normalizedSaleId);
          return nextIds;
        });
        return;
      }

      setDeletedSaleIds((current) => {
        const nextIds = new Set(current);
        nextIds.add(normalizedSaleId);
        return nextIds;
      });
      setExtraSales(nextSnapshot);

      adjustInventoryForSales([removedSale], 1);
      void syncSales(currentSnapshot, nextSnapshot);
      recordSaleAuditLogs([
        buildSaleAuditLog({
          action: "deleted",
          beforeSale: removedSale,
          afterSale: null,
          branch: removedSale.branch || "",
          source: "browser",
          metadata: {
            summary: "Deleted a sale record.",
            details: `${removedSale.product || "Sale"} for ${Number(removedSale.qty || 0)} units was removed from the ledger.`
          }
        })
      ]);
      scheduleConsistencyRetry();
    },
    [
      adjustInventoryForSales,
      extraSalesState,
      recordSaleAuditLogs,
      scheduleConsistencyRetry,
      setExtraSales,
      syncSales
    ]
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
        recordSaleAuditLogs([
          buildSaleAuditLog({
            action: "undone",
            beforeSale: removedSale,
            afterSale: null,
            branch: removedSale.branch || normalizedBranch,
            source: "browser",
            metadata: {
              summary: "Undid the latest sale.",
              details: `${removedSale.product || "Sale"} for ${Number(removedSale.qty || 0)} units was restored to inventory.`
            }
          })
        ]);
        scheduleConsistencyRetry();
      }
    },
    [adjustInventoryForSales, recordSaleAuditLogs, scheduleConsistencyRetry, setExtraSales]
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
        recordSaleAuditLogs([
          buildSaleAuditLog({
            action: "voided",
            beforeSale: removedSale,
            afterSale: null,
            branch: removedSale.branch || normalizedBranch,
            reason: normalizedReason,
            source: "browser",
            metadata: {
              summary: "Voided the latest sale.",
              details: `${removedSale.product || "Sale"} was voided because ${normalizedReason}.`
            }
          })
        ]);
        scheduleConsistencyRetry();
      }

      return removedSale;
    },
    [adjustInventoryForSales, recordSaleAuditLogs, scheduleConsistencyRetry, setExtraSales]
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
        recordSaleAuditLogs([
          buildSaleAuditLog({
            action: "corrected",
            beforeSale: previousSale,
            afterSale: correctedSale,
            branch: previousSale.branch || correctedSale.branch || "",
            reason: normalizedReason,
            source: "browser",
            metadata: {
              summary: "Corrected a sale record.",
              details: `${previousSale.product || "Sale"} was updated to ${correctedSale.product || "sale"} with ${Number(
                correctedSale.qty || 0
              )} units because ${normalizedReason}.`
            }
          })
        ]);
        scheduleConsistencyRetry();
      }

      return correctedSale;
    },
    [adjustInventoryForSales, recordSaleAuditLogs, scheduleConsistencyRetry, setExtraSales]
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
