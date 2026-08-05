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
  getSaleInventoryQuantity,
  isSiomaiItem,
  roundSiomaiQuantity
} from "../utils/siomaiUnits";

const SalesContext = createContext(null);
const STORAGE_KEY = "smart_inventory_sales";
const CORRECTIONS_KEY = "smart_inventory_sale_corrections";
const SALES_TABLE = import.meta.env.VITE_SUPABASE_SALES_TABLE || "sales_records";
const hasSupabaseConfig =
  Boolean(import.meta.env.VITE_SUPABASE_URL) && Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

function normalizeSale(sale) {
  if (!sale || typeof sale !== "object") return null;

  const id = sale.id ?? sale.sale_id ?? `sale-${Date.now()}`;
  const inventoryItemId =
    sale.inventoryItemId ?? sale.inventory_item_id ?? sale.inventory_itemid ?? null;

  return {
    ...sale,
    id: typeof id === "string" ? id : String(id),
    date: typeof sale.date === "string" ? sale.date : "",
    product: typeof sale.product === "string" ? sale.product : "",
    qty: Number(sale.qty ?? 0),
    price: Number(sale.price ?? 0),
    notes: typeof sale.notes === "string" ? sale.notes : "",
    branch:
      BRANCH_OPTIONS.some((option) => option.value === sale.branch)
        ? sale.branch
        : typeof sale.branch === "string"
        ? sale.branch.trim()
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
    date: sale.date,
    product: sale.product,
    branch: sale.branch || null,
    qty: Number(sale.qty || 0),
    price: Number(sale.price || 0),
    notes: sale.notes || null,
    inventory_item_id:
      sale.inventoryItemId === undefined || sale.inventoryItemId === null
        ? null
        : Number(sale.inventoryItemId),
    inventory_item_name: sale.inventoryItemName || null,
    inventory_qty:
      sale.inventoryQty === undefined || sale.inventoryQty === null
        ? null
        : Number(sale.inventoryQty)
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
  const { setInventory } = useInventory();
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
  const [isLoadingSales, setIsLoadingSales] = useState(hasSupabaseConfig);
  const [salesSyncError, setSalesSyncError] = useState("");
  const remoteLoadedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(extraSalesState));
  }, [extraSalesState]);

  useEffect(() => {
    localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(saleCorrections));
  }, [saleCorrections]);

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
        setExtraSalesState(normalizeSales(data));
        setSalesSyncError("");
      }

      setIsLoadingSales(false);
      remoteLoadedRef.current = true;
    }

    loadSales();

    return () => {
      isMounted = false;
    };
  }, []);

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
        const normalizedNext = normalizeSales(nextItems);

        if (remoteLoadedRef.current) {
          void syncSales(current, normalizedNext);
        }

        return normalizedNext;
      });
    },
    [syncSales]
  );

  const salesHistory = useMemo(() => {
    return extraSalesState;
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
    },
    [adjustInventoryForSales, setExtraSales]
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
  }, [adjustInventoryForSales, extraSalesState, setExtraSales]);

  const deleteSaleRecord = useCallback(
    (saleId) => {
      let removedSale = null;
      setExtraSales((prev) =>
        prev.filter((sale) => {
          if (sale.id !== saleId) return true;
          removedSale = sale;
          return false;
        })
      );

      if (removedSale) {
        adjustInventoryForSales([removedSale], 1);
      }
    },
    [adjustInventoryForSales, setExtraSales]
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
      }
    },
    [adjustInventoryForSales, setExtraSales]
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
      }

      return removedSale;
    },
    [adjustInventoryForSales, setExtraSales]
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
      }

      return correctedSale;
    },
    [adjustInventoryForSales, setExtraSales]
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
      salesSyncError
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
    salesSyncError
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
