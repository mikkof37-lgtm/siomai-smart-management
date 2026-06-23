/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useInventory } from "./InventoryContext";

const SalesContext = createContext(null);
const STORAGE_KEY = "smart_inventory_sales";
const SEED_VISIBILITY_KEY = "smart_inventory_sales_show_seed";
const HIDDEN_SEED_IDS_KEY = "smart_inventory_sales_hidden_seed_ids";

const sampleDates = [
  "Mar 24, 2026",
  "Mar 23, 2026",
  "Mar 22, 2026",
  "Mar 21, 2026",
  "Mar 20, 2026",
  "Mar 19, 2026",
  "Mar 18, 2026",
  "Mar 17, 2026"
];

export function SalesProvider({ children }) {
  const { inventory, setInventory } = useInventory();
  const [extraSales, setExtraSales] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // Ignore invalid storage and fall back to empty list.
      }
    }
    return [];
  });
  const [showSeedSales, setShowSeedSales] = useState(() => {
    const stored = localStorage.getItem(SEED_VISIBILITY_KEY);
    return stored === null ? true : stored === "1";
  });
  const [hiddenSeedSaleIds, setHiddenSeedSaleIds] = useState(() => {
    const stored = localStorage.getItem(HIDDEN_SEED_IDS_KEY);
    if (!stored) return [];

    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(extraSales));
  }, [extraSales]);

  useEffect(() => {
    localStorage.setItem(SEED_VISIBILITY_KEY, showSeedSales ? "1" : "0");
  }, [showSeedSales]);

  useEffect(() => {
    localStorage.setItem(HIDDEN_SEED_IDS_KEY, JSON.stringify(hiddenSeedSaleIds));
  }, [hiddenSeedSaleIds]);

  const baseSales = useMemo(() => {
    return inventory.map((item, index) => {
      const qty = Math.max(1, (item.stock % 12) + 1);
      return {
        id: `seed-${item.id}`,
        date: sampleDates[index % sampleDates.length],
        product: item.name,
        qty,
        price: Number(item.price || 0)
      };
    });
  }, [inventory]);

  const salesHistory = useMemo(() => {
    const visibleBaseSales = showSeedSales
      ? baseSales.filter((sale) => !hiddenSeedSaleIds.includes(sale.id))
      : [];
    return [...extraSales, ...visibleBaseSales];
  }, [extraSales, baseSales, hiddenSeedSaleIds, showSeedSales]);

  const totalRevenue = useMemo(() => {
    return salesHistory.reduce((sum, sale) => {
      const qty = Number(sale.qty) || 0;
      const price = Number(sale.price) || 0;
      return sum + qty * price;
    }, 0);
  }, [salesHistory]);

  const addSale = useCallback((sale) => {
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
      const id = sale.id ?? `sale-${Date.now()}`;
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
  }, [setInventory]);

  const clearRecordedSales = useCallback(() => {
    setInventory((prev) => {
      const next = [...prev];
      extraSales.forEach((sale) => {
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
    setShowSeedSales(false);
    setHiddenSeedSaleIds([]);
  }, [extraSales, setInventory]);

  const deleteSaleRecord = useCallback((saleId) => {
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

    if (typeof saleId === "string" && saleId.startsWith("seed-")) {
      setHiddenSeedSaleIds((prev) => {
        if (prev.includes(saleId)) return prev;
        return [...prev, saleId];
      });
    }
  }, [setInventory]);

  const value = useMemo(() => {
    return { salesHistory, addSale, clearRecordedSales, deleteSaleRecord, totalRevenue };
  }, [salesHistory, addSale, clearRecordedSales, deleteSaleRecord, totalRevenue]);

  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
}

export function useSales() {
  const ctx = useContext(SalesContext);
  if (!ctx) {
    throw new Error("useSales must be used within a SalesProvider");
  }
  return ctx;
}
