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

const SalesContext = createContext(null);
const STORAGE_KEY = "smart_inventory_sales";
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

function toSalesRow(sale) {
  return {
    id: sale.id,
    date: sale.date,
    product: sale.product,
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
  const [isLoadingSales, setIsLoadingSales] = useState(hasSupabaseConfig);
  const [salesSyncError, setSalesSyncError] = useState("");
  const remoteLoadedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(extraSalesState));
  }, [extraSalesState]);

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
        // Surface the actual failure so we can fix the backend instead of guessing.
        console.error("Sales sync failed:", error);
        setSalesSyncError(
          `Sales changes were saved locally, but Supabase sync failed for "${SALES_TABLE}". ${error?.message || ""}`.trim()
        );
      }
    },
    []
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

  const addSale = useCallback(
    (sale) => {
      const inventoryItemId = sale.inventoryItemId ?? null;
      const inventoryQty = Number(sale.inventoryQty ?? sale.qty) || 0;

      if (inventoryItemId && inventoryQty > 0) {
        setInventory((prev) =>
          prev.map((item) => {
            if (item.id !== inventoryItemId) return item;
            return {
              ...item,
              stock: Math.max(0, Number(item.stock || 0) - inventoryQty)
            };
          })
        );
      }

      setExtraSales((prev) => {
        const id = sale.id ?? (globalThis.crypto?.randomUUID?.() ?? `sale-${Date.now()}`);
        return [
          {
            ...sale,
            id,
            inventoryItemId,
            inventoryQty: inventoryQty > 0 ? inventoryQty : undefined
          },
          ...prev
        ];
      });
    },
    [setInventory, setExtraSales]
  );

  const clearRecordedSales = useCallback(() => {
    setInventory((prev) => {
      const next = [...prev];
      extraSalesState.forEach((sale) => {
        const inventoryItemId = sale.inventoryItemId ?? null;
        const inventoryQty = Number(sale.inventoryQty ?? sale.qty) || 0;
        if (!inventoryItemId || inventoryQty <= 0) return;

        const index = next.findIndex((item) => item.id === inventoryItemId);
        if (index === -1) return;
        next[index] = {
          ...next[index],
          stock: Number(next[index].stock || 0) + inventoryQty
        };
      });
      return next;
    });
    setExtraSales([]);
  }, [extraSalesState, setExtraSales, setInventory]);

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
        const inventoryItemId = removedSale.inventoryItemId ?? null;
        const inventoryQty = Number(removedSale.inventoryQty ?? removedSale.qty) || 0;
        if (inventoryItemId && inventoryQty > 0) {
          setInventory((prev) =>
            prev.map((item) => {
              if (item.id !== inventoryItemId) return item;
              return {
                ...item,
                stock: Number(item.stock || 0) + inventoryQty
              };
            })
          );
        }
      }
    },
    [setExtraSales, setInventory]
  );

  const value = useMemo(() => {
    return {
      salesHistory,
      addSale,
      clearRecordedSales,
      deleteSaleRecord,
      totalRevenue,
      isLoadingSales,
      salesSyncError
    };
  }, [
    salesHistory,
    addSale,
    clearRecordedSales,
    deleteSaleRecord,
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
