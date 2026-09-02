import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { BRANCH_OPTIONS } from "../data/branches";
import { useInventory } from "../context/InventoryContext";
import { useSales } from "../context/SalesContext";
import { canAccessStaffSales, getUserDefaultBranch } from "../utils/authRoles";
import { compareInventoryDisplayOrder } from "../utils/inventoryOrdering";
import { buildUniqueSaleProductOptions } from "../utils/saleProductOptions";
import {
  getSalePricingHint,
  getSaleQuantityUnitLabel,
  getSaleUnitPrice,
  isIncludedSaleItem
} from "../utils/salePricing";
import {
  formatInventoryQuantityForDisplay,
  getSaleInventoryQuantity,
} from "../utils/siomaiUnits";
import {
  formatSaleDate,
  normalizeSaleDateValue,
  saleDateKey
} from "../utils/salesDates";

const formatCurrency = (value) =>
  `PHP ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const toDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeText = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const STAFF_SALES_EXCLUDED_PRODUCTS = new Set([
  "chili oil (gallon)",
  "garlic",
  "soy sauce (gallon)",
  "roasted garlic 1kg"
]);

const resolveInventoryItem = (inventory, productName) => {
  const normalized = normalizeText(productName);
  if (!normalized) return null;

  const exactMatch = inventory.find((item) => normalizeText(item.name) === normalized);
  if (exactMatch) return exactMatch;

  const partialMatches = inventory.filter((item) => normalizeText(item.name).includes(normalized));
  return partialMatches.length === 1 ? partialMatches[0] : null;
};

const createDraftLine = () => ({
  id: globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  product: "",
  qty: "1"
});

const getQuantityValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const createReceiptDraft = (branch = "") => ({
  branch,
  saleDate: toDateInputValue(),
  notes: "",
  items: [createDraftLine()]
});

const getBranchLabel = (value) => {
  const branch = BRANCH_OPTIONS.find((option) => option.value === value);
  return branch?.label || value || "All branches";
};

export default function StaffSales({ onLogout, currentUser }) {
  const { inventory, inventorySyncError } = useInventory();
  const {
    salesHistory,
    addSalesBatch,
    correctSaleRecord,
    saleCorrections,
    isLoadingSales,
    salesSyncError,
    retrySalesSync
  } = useSales();
  const [receiptDraft, setReceiptDraft] = useState(() =>
    createReceiptDraft(getUserDefaultBranch(currentUser) || "")
  );
  const [recordError, setRecordError] = useState("");
  const [recordSuccess, setRecordSuccess] = useState("");
  const [correctionDraft, setCorrectionDraft] = useState(null);
  const [focusProductLineId, setFocusProductLineId] = useState("");
  const productInputRefs = useRef(new Map());
  const correctionPanelRef = useRef(null);

  const defaultBranch = getUserDefaultBranch(currentUser);
  const todayKey = saleDateKey(new Date());

  useEffect(() => {
    if (!focusProductLineId) return;

    const input = productInputRefs.current.get(focusProductLineId);
    if (input) {
      input.focus();
      input.select?.();
    }
  }, [focusProductLineId]);

  useEffect(() => {
    if (!correctionDraft) return;
    if (typeof correctionPanelRef.current?.scrollIntoView === "function") {
      correctionPanelRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [correctionDraft]);

  const inventoryProductOptions = useMemo(() => {
    return [...inventory]
      .sort(compareInventoryDisplayOrder)
      .map((item) => ({
        id: item.id,
        name: item.name,
        stock: Number(item.stock || 0),
        unit: item.unit || "units",
        price: Number(item.price || 0),
        threshold: Number(item.threshold || 0)
      }));
  }, [inventory]);

  const inventoryNameOptions = useMemo(() => {
    return buildUniqueSaleProductOptions(inventoryProductOptions)
      .map((item) => item.name)
      .filter((name) => !STAFF_SALES_EXCLUDED_PRODUCTS.has(normalizeText(name)));
  }, [inventoryProductOptions]);

  const lineItems = useMemo(() => {
    return receiptDraft.items.map((line) => {
      const selectedInventoryItem = resolveInventoryItem(inventory, line.product);
      const qty = getQuantityValue(line.qty);
      const unitPrice = getSaleUnitPrice(selectedInventoryItem);
      const inventoryQty = selectedInventoryItem
        ? getSaleInventoryQuantity(selectedInventoryItem, qty)
        : 0;
      const lineTotal =
        Number.isFinite(qty) && qty > 0 && selectedInventoryItem ? qty * unitPrice : 0;

      return {
        ...line,
        qty,
        selectedInventoryItem,
        unitPrice,
        inventoryQty,
        lineTotal,
        remainingStock:
          selectedInventoryItem && Number.isFinite(qty)
            ? Math.max(0, Number(selectedInventoryItem.stock || 0) - inventoryQty)
            : null
      };
    });
  }, [inventory, receiptDraft.items]);

  const validLineItems = lineItems.filter(
    (line) => line.product.trim() && Number.isFinite(line.qty) && line.qty > 0 && line.selectedInventoryItem
  );

  const receiptTotal = useMemo(() => {
    return validLineItems.reduce((sum, line) => sum + line.lineTotal, 0);
  }, [validLineItems]);

  const branchSales = useMemo(() => {
    const branch = receiptDraft.branch.trim();
    const scoped = branch
      ? salesHistory.filter((sale) => (sale.branch || "").trim() === branch)
      : salesHistory;

    return scoped.filter((sale) => saleDateKey(sale.date) === todayKey);
  }, [receiptDraft.branch, salesHistory, todayKey]);

  const branchSalesTotal = useMemo(() => {
    return branchSales.reduce((sum, sale) => sum + Number(sale.qty || 0) * Number(sale.price || 0), 0);
  }, [branchSales]);

  const branchSalesCount = branchSales.length;

  const lowStockItems = useMemo(() => {
    return inventoryProductOptions.filter(
      (item) => item.stock <= item.threshold || item.stock <= 10
    );
  }, [inventoryProductOptions]);

  const topSellingItem = useMemo(() => {
    if (branchSales.length === 0) return null;
    const counts = new Map();
    branchSales.forEach((sale) => {
      const key = sale.product || "Unknown";
      counts.set(key, (counts.get(key) || 0) + Number(sale.qty || 0));
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [branchSales]);

  const recentSales = useMemo(() => {
    const branch = receiptDraft.branch.trim();
    return salesHistory
      .filter((sale) => {
        if (!branch) return true;
        return (sale.branch || "").trim() === branch;
      })
      .slice(0, 5);
  }, [receiptDraft.branch, salesHistory]);

  const selectedSaleForCorrection = useMemo(() => {
    if (!correctionDraft) return null;
    return recentSales.find((sale) => sale.id === correctionDraft.saleId) || null;
  }, [correctionDraft, recentSales]);

  const activeBranch = receiptDraft.branch.trim() || defaultBranch;

  const clearReceiptDraft = () => {
    const nextDraft = createReceiptDraft(defaultBranch || "");
    setReceiptDraft(nextDraft);
    setFocusProductLineId(nextDraft.items[0].id);
    setCorrectionDraft(null);
    setRecordError("");
    setRecordSuccess("");
  };

  const addLineItem = () => {
    const nextLine = createDraftLine();
    setReceiptDraft((prev) => ({
      ...prev,
      items: [...prev.items, nextLine]
    }));
    setFocusProductLineId(nextLine.id);
  };

  const updateLineItem = (lineId, field, value) => {
    setReceiptDraft((prev) => ({
      ...prev,
      items: prev.items.map((line) => (line.id === lineId ? { ...line, [field]: value } : line))
    }));
  };

  const registerProductInput = (lineId) => (node) => {
    if (node) {
      productInputRefs.current.set(lineId, node);
      return;
    }

    productInputRefs.current.delete(lineId);
  };

  const startCorrection = (sale) => {
    setCorrectionDraft({
      saleId: sale.id,
      product: sale.product || "",
      qty: String(sale.qty || 1),
      reason: ""
    });
    setRecordError("");
    setRecordSuccess("");
  };

  const handleApplyCorrection = () => {
    const branch = activeBranch;
    if (!branch) {
      setRecordError("Choose a branch first before correcting a sale.");
      return;
    }

    if (!selectedSaleForCorrection) {
      setRecordError("Select a sale line item to correct.");
      return;
    }

    const reason = correctionDraft.reason.trim();
    if (!reason) {
      setRecordError("Please enter a reason for the correction.");
      return;
    }

    const product = correctionDraft.product.trim();
    if (!product) {
      setRecordError("Please choose a product for the correction.");
      return;
    }

    const qty = getQuantityValue(correctionDraft.qty);
    const inventoryItem = resolveInventoryItem(inventory, product);
    if (!inventoryItem) {
      setRecordError("Please choose an exact inventory item for the correction.");
      return;
    }

    const oldQty = Number.isFinite(Number(selectedSaleForCorrection.inventoryQty))
      ? Number(selectedSaleForCorrection.inventoryQty)
      : getSaleInventoryQuantity(inventoryItem, selectedSaleForCorrection.qty);
    const requestedQty = getSaleInventoryQuantity(inventoryItem, qty);
    const currentStock = Number(inventoryItem.stock || 0);
    const sameInventoryItem =
      String(inventoryItem.id) === String(selectedSaleForCorrection.inventoryItemId);
    const availableAfterRestore = sameInventoryItem ? currentStock + oldQty : currentStock;

    if (requestedQty > availableAfterRestore) {
      setRecordError(
        `Not enough stock for ${inventoryItem.name}. Available after correction: ${formatInventoryQuantityForDisplay(
          inventoryItem,
          availableAfterRestore,
          inventoryItem.unit || "units"
        )}.`
      );
      return;
    }

    const correctedSale = correctSaleRecord(
      selectedSaleForCorrection.id,
      {
        product,
        qty,
        price: getSaleUnitPrice(inventoryItem),
        inventoryItemId: inventoryItem.id,
        inventoryItemName: inventoryItem.name,
        inventoryQty: requestedQty
      },
      reason
    );

    if (!correctedSale) {
      setRecordError("The sale could not be corrected.");
      return;
    }

    setCorrectionDraft(null);
    setRecordError("");
    setRecordSuccess(
      `Corrected ${selectedSaleForCorrection.product} for ${getBranchLabel(branch)}. Reason: ${reason}.`
    );
  };

  const removeLineItem = (lineId) => {
    setReceiptDraft((prev) => {
      if (prev.items.length === 1) {
        return {
          ...prev,
          items: [createDraftLine()]
        };
      }

      return {
        ...prev,
        items: prev.items.filter((line) => line.id !== lineId)
      };
    });
  };

  const handleFinalizeSale = (e) => {
    e.preventDefault();
    setRecordError("");
    setRecordSuccess("");

    const branch = receiptDraft.branch.trim();
    const saleDate = receiptDraft.saleDate;
    const notes = receiptDraft.notes.trim();
    const requestedLines = lineItems.filter((line) => line.product.trim());

    if (!branch) {
      setRecordError("Please choose a branch.");
      return;
    }

    if (!requestedLines.length) {
      setRecordError("Please add at least one item to the sale.");
      return;
    }

    const resolvedLines = [];
    const requestedTotals = new Map();

    for (const [index, line] of requestedLines.entries()) {
      const product = line.product.trim();
      const qty = Number(line.qty);

      if (!product) {
        setRecordError(`Please choose a product for item ${index + 1}.`);
        return;
      }

      if (!Number.isFinite(qty) || qty <= 0) {
        setRecordError(`Quantity must be a valid number for item ${index + 1}.`);
        return;
      }

      const inventoryItem = line.selectedInventoryItem;
      if (!inventoryItem) {
        setRecordError(`Please choose an exact inventory item for item ${index + 1}.`);
        return;
      }

      const key = String(inventoryItem.id);
      const inventoryQty = getSaleInventoryQuantity(inventoryItem, qty);
      requestedTotals.set(key, (requestedTotals.get(key) || 0) + inventoryQty);

      resolvedLines.push({
        product,
        qty,
        price: line.unitPrice,
        inventoryItem,
        inventoryQty,
        unit: inventoryItem.unit || "units"
      });
    }

    for (const [inventoryItemId, requestedQty] of requestedTotals.entries()) {
      const inventoryItem = inventory.find((item) => String(item.id) === String(inventoryItemId));
      if (!inventoryItem) {
        setRecordError("One of the selected items could not be found in inventory.");
        return;
      }

      if (requestedQty > Number(inventoryItem.stock || 0)) {
        setRecordError(
          `Not enough stock for ${inventoryItem.name}. Available: ${formatInventoryQuantityForDisplay(
            inventoryItem,
            inventoryItem.stock,
            inventoryItem.unit || "units"
          )}.`
        );
        return;
      }
    }

    const batchId = globalThis.crypto?.randomUUID?.() ?? `receipt-${Date.now()}`;
    const recordedAt = new Date().toISOString();
    const saleRecords = resolvedLines.map((line, index) => ({
      id: `${batchId}-${index}`,
      date: normalizeSaleDateValue(saleDate),
      branch,
      product: line.product,
      qty: line.qty,
      price: line.price,
      notes,
      inventoryItemId: line.inventoryItem.id,
      inventoryItemName: line.inventoryItem.name,
      inventoryQty: line.inventoryQty,
      createdAt: recordedAt
    }));

    addSalesBatch(saleRecords);
    setRecordSuccess(`Sale saved for ${getBranchLabel(branch)}.`);

    setReceiptDraft(createReceiptDraft(defaultBranch || ""));
  };

  if (!canAccessStaffSales(currentUser)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#fff8f1_0%,#f6efe7_42%,#efe7de_100%)] md:flex-row">
      <Sidebar currentUser={currentUser} />

      <div className="flex-1">
        <TopBar
          title="Staff Sales"
          subtitle="Record branch sales and keep stock in sync."
          onLogout={onLogout}
          currentUser={currentUser}
        />

        <div className="px-4 pb-28 pt-4 sm:px-6 sm:pb-28 sm:pt-6 lg:px-8">
          {(isLoadingSales || salesSyncError || inventorySyncError) && (
            <div
              className={[
                "mb-6 rounded-2xl border px-4 py-3 text-sm shadow-sm",
                salesSyncError || inventorySyncError
                  ? "border-[#ffd5d0] bg-[#fff4f2] text-[#b0483b]"
                  : "border-[#dcefd8] bg-[#f2fbef] text-[#3c7a2c]"
              ].join(" ")}
            >
              <div className="font-semibold">
                {isLoadingSales ? "Checking sales database" : "Sales database status"}
              </div>
              <div className="mt-1">
                {salesSyncError ||
                  inventorySyncError ||
                  "Connected to the sales database. Updates sync in real time."}
              </div>
              {salesSyncError && (
                <button
                  type="button"
                  onClick={() => void retrySalesSync()}
                  className="mt-3 rounded-lg border border-[#b0483b] px-3 py-1.5 text-xs font-semibold text-[#b0483b] transition hover:bg-[#b0483b] hover:text-white"
                >
                  Retry sales sync
                </button>
              )}
            </div>
          )}

          <div className="mb-6 overflow-hidden rounded-[28px] border border-[rgba(97,72,56,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(255,249,243,0.95)_56%,rgba(255,239,223,0.92)_100%)] shadow-[var(--shadow-soft)]">
            <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-center">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b85d11]">
                  Shift terminal
                </div>
                <h1 className="text-3xl font-semibold text-[var(--app-text)] sm:text-4xl">
                  Record shift sales without losing the ledger.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--surface-muted)]">
                  Pick the branch, add the items, and save the batch without losing track of stock.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-[rgba(97,72,56,0.12)] bg-white/85 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                    Branch
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[var(--app-text)]">
                    {getBranchLabel(receiptDraft.branch) || "Unassigned"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[rgba(97,72,56,0.12)] bg-white/85 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                    Draft total
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[var(--app-text)]">{formatCurrency(receiptTotal)}</p>
                </div>
                <div className="rounded-[20px] border border-[rgba(97,72,56,0.12)] bg-white/85 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                    Today
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[#b85d11]">{branchSalesCount}</p>
                </div>
                <div className="rounded-[20px] border border-[rgba(97,72,56,0.12)] bg-white/85 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                    Attention
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[#b85d11]">{lowStockItems.length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-6">
              <div className="overflow-hidden rounded-[28px] border border-[rgba(97,72,56,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,250,245,0.94)_100%)] shadow-[var(--shadow-soft)]">
                <div className="border-b border-[rgba(97,72,56,0.08)] bg-[linear-gradient(135deg,rgba(255,251,248,0.96)_0%,rgba(255,244,233,0.95)_60%,rgba(255,236,220,0.92)_100%)] px-6 py-5">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b85d11]">
                        Entry panel
                      </div>
                      <h1 className="text-2xl font-semibold text-[var(--app-text)]">Sale entry</h1>
                      <p className="mt-1 text-sm text-[var(--surface-muted)]">
                        Add every item in the branch sale, then send it to the ledger.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[rgba(97,72,56,0.12)] bg-white px-4 py-3 shadow-[0_12px_30px_-24px_rgba(58,41,29,0.35)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                        Shift date
                      </p>
                      <p className="text-sm font-semibold text-[var(--app-text)]">
                        {formatSaleDate(todayKey)}
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleFinalizeSale} className="space-y-6 px-6 py-6">
                  <div>
                    <p className="text-sm font-medium text-[#5a4a3f]">Branch</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {BRANCH_OPTIONS.map((branch) => (
                        <button
                          key={branch.value}
                          type="button"
                          onClick={() =>
                            {
                              setReceiptDraft((prev) => ({ ...prev, branch: branch.value }));
                              setCorrectionDraft(null);
                            }
                          }
                          className={[
                            "rounded-full border px-4 py-2 text-sm font-semibold transition",
                            receiptDraft.branch === branch.value
                              ? "border-[#ff7a1a] bg-[#fff1e3] text-[#c96f15]"
                              : "border-[#efe0d4] bg-white text-[#6f5f52] hover:border-[#ffb47b] hover:text-[#ff6a00]"
                          ].join(" ")}
                        >
                          {branch.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="sale-date" className="text-sm font-medium text-[#5a4a3f]">
                        Sale Date
                      </label>
                      <input
                        id="sale-date"
                        type="date"
                        value={receiptDraft.saleDate}
                        onChange={(e) =>
                          setReceiptDraft((prev) => ({ ...prev, saleDate: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                      />
                    </div>
                    <div>
                      <label htmlFor="sale-notes" className="text-sm font-medium text-[#5a4a3f]">
                        Notes
                      </label>
                      <input
                        id="sale-notes"
                        type="text"
                        value={receiptDraft.notes}
                        onChange={(e) =>
                          setReceiptDraft((prev) => ({ ...prev, notes: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                        placeholder="Optional notes for this sale"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-[#2b2018]">Sold Items</h2>
                        <p className="mt-1 text-sm text-[#8c7b6d]">
                          Add all items for this branch sale before recording.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addLineItem}
                        className="rounded-full border border-[#efc9b4] bg-white px-4 py-2 text-sm font-semibold text-[#c35f18] transition hover:border-[#ffb47b] hover:text-[#ff6a00]"
                      >
                        Add item
                      </button>
                    </div>

                    <div className="space-y-4">
                      {lineItems.map((line) => (
                        <div
                          key={line.id}
                          className="rounded-[22px] border border-[#f0dfd0] bg-gradient-to-br from-[#fffaf7] via-[#fffaf5] to-[#fff7ef] p-3 shadow-[0_10px_28px_-24px_rgba(58,41,29,0.45)] md:p-4"
                        >
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => removeLineItem(line.id)}
                              className="inline-flex h-8 items-center gap-1 rounded-full border border-transparent bg-white/70 px-3 text-xs font-semibold text-[#9a8b7d] transition hover:border-[#efc9b4] hover:bg-white hover:text-[#c35f18]"
                            >
                              <span className="text-sm leading-none">×</span>
                              Remove
                            </button>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,0.7fr)_minmax(0,0.9fr)]">
                            <div className="sm:col-span-2 xl:col-span-1">
                              <label
                                htmlFor={`item-product-${line.id}`}
                                className="text-sm font-medium text-[#5a4a3f]"
                              >
                                Product
                              </label>
                              <select
                                id={`item-product-${line.id}`}
                                ref={registerProductInput(line.id)}
                                value={line.product}
                                onChange={(e) =>
                                  updateLineItem(line.id, "product", e.target.value)
                                }
                                className="mt-1 h-11 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                              >
                                <option value="">Choose product</option>
                                {inventoryNameOptions.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="rounded-2xl border border-[#f1e2d6] bg-white/70 px-3 py-3">
                              <label
                                htmlFor={`item-qty-${line.id}`}
                                className="text-sm font-medium text-[#5a4a3f]"
                              >
                                Qty
                              </label>
                              <p className="mt-1 text-[11px] leading-4 text-[#9a8b7d]">
                                {line.selectedInventoryItem
                                  ? isIncludedSaleItem(line.selectedInventoryItem)
                                    ? `Enter the sold quantity in ${getSaleQuantityUnitLabel(line.selectedInventoryItem)}`
                                    : getSaleQuantityUnitLabel(line.selectedInventoryItem) === "pcs"
                                    ? "Enter siomai sales in pcs"
                                    : getSaleQuantityUnitLabel(line.selectedInventoryItem) === "pieces"
                                    ? "Enter paper cup sales in pieces"
                                    : `Enter the sold quantity in ${getSaleQuantityUnitLabel(line.selectedInventoryItem)}`
                                  : "Enter the sold quantity"}
                              </p>
                              {line.selectedInventoryItem && (
                                <p className="mt-1 text-[11px] leading-4 text-[#9a8b7d]">
                                  {getSalePricingHint(line.selectedInventoryItem) ||
                                    `Pricing uses ${formatCurrency(line.unitPrice)} per unit.`}
                                </p>
                              )}
                              {line.selectedInventoryItem &&
                                !isIncludedSaleItem(line.selectedInventoryItem) &&
                                getSaleQuantityUnitLabel(line.selectedInventoryItem) === "pieces" && (
                                  <p className="mt-1 text-[11px] leading-4 text-[#9a8b7d]">
                                    Public sale is PHP 12.00 per piece.
                                  </p>
                                )}
                              <input
                                id={`item-qty-${line.id}`}
                                type="number"
                                min="1"
                                step="1"
                                inputMode="numeric"
                                value={line.qty}
                                onChange={(e) =>
                                  updateLineItem(line.id, "qty", e.target.value)
                                }
                                onFocus={(e) => e.target.select()}
                                className="mt-1 h-11 w-full rounded-xl border border-[#efe5db] bg-white px-3 py-2.5 text-center text-sm font-semibold text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                                placeholder="1"
                              />
                            </div>

                            <div className="rounded-2xl border border-[#ffd7b3] bg-[#fff1e3] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#c96f15]">
                                Line total
                              </p>
                              <p className="mt-2 text-xl font-semibold text-[#ff7a1a]">
                                {formatCurrency(line.lineTotal)}
                              </p>
                              <p className="mt-1 text-xs leading-4 text-[#8f7d70]">
                                {line.selectedInventoryItem
                                  ? `${formatInventoryQuantityForDisplay(
                                      line.selectedInventoryItem,
                                      line.remainingStock,
                                      line.selectedInventoryItem.unit || "units"
                                    )} remaining`
                                  : "Select an item"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {recordError && <p className="text-sm text-red-600">{recordError}</p>}
                  {recordSuccess && <p className="text-sm text-green-700">{recordSuccess}</p>}

                  <div className="sticky bottom-4 z-20 rounded-[24px] border border-[#efe6dc] bg-white/95 px-4 py-4 shadow-[0_18px_50px_-28px_rgba(58,41,29,0.55)] backdrop-blur">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                          Ready to finalize
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#6f5f52]">
                          <span className="rounded-full bg-[#fffaf5] px-3 py-1 font-semibold text-[#2b2018]">
                            {getBranchLabel(receiptDraft.branch)}
                          </span>
                          <span className="rounded-full bg-[#fffaf5] px-3 py-1 font-semibold text-[#2b2018]">
                            {validLineItems.length} item{validLineItems.length === 1 ? "" : "s"}
                          </span>
                          <span className="rounded-full bg-[#fff1e3] px-3 py-1 font-semibold text-[#c96f15]">
                            {formatCurrency(receiptTotal)}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
                        <button
                          type="button"
                          onClick={clearReceiptDraft}
                          className="rounded-xl border border-[#1f1b16] px-4 py-2.5 text-sm font-semibold text-[#1f1b16] transition hover:border-[#3a2d24]"
                        >
                          Clear
                        </button>
                        <button
                          type="submit"
                          className="rounded-xl bg-[#ff7a1a] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00]"
                        >
                          Record Sale
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[24px] border border-dashed border-[#e8d9cb] bg-[#fffaf5] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                          Branch snapshot
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#2b2018]">
                          Quick read before you record the batch
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#c35f18]">
                        Live
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                          Sales today
                        </p>
                        <p className="mt-1 text-lg font-semibold text-[#ff7a1a]">
                          {formatCurrency(branchSalesTotal)}
                        </p>
                        <p className="text-xs text-[#9a8b7d]">
                          {branchSalesCount} recorded {branchSalesCount === 1 ? "sale" : "sales"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                          Recent entries
                        </p>
                        <p className="mt-1 text-lg font-semibold text-[#2b2018]">
                          {recentSales.length}
                        </p>
                        <p className="text-xs text-[#9a8b7d]">
                          Ready for corrections
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                          Low stock
                        </p>
                        <p className="mt-1 text-lg font-semibold text-[#2b2018]">
                          {lowStockItems.length}
                        </p>
                        <p className="text-xs text-[#9a8b7d]">
                          Items needing attention
                        </p>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-[#efe6dc] bg-white p-6 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#2b2018]">Sale preview</h2>
                    <p className="mt-1 text-sm text-[#8c7b6d]">
                      This batch will be saved for {getBranchLabel(receiptDraft.branch)}.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#fff1e3] px-3 py-1 text-[11px] font-semibold text-[#c96f15]">
                      Live
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {defaultBranch && (
                    <div className="rounded-2xl border border-[#efe6dc] bg-[#fffaf5] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                        Default branch
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#2b2018]">
                        {getBranchLabel(defaultBranch)}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-2xl bg-[#fffaf5] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-[#2b2018]">Today&apos;s total</p>
                      <p className="text-xs text-[#9a8b7d]">Selected branch only</p>
                    </div>
                    <p className="text-base font-semibold text-[#ff7a1a]">
                      {formatCurrency(branchSalesTotal)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-[#fffaf5] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-[#2b2018]">Top item</p>
                      <p className="text-xs text-[#9a8b7d]">Most sold today</p>
                    </div>
                    <p className="text-sm font-semibold text-[#2b2018]">
                      {topSellingItem ? `${topSellingItem[0]} (${topSellingItem[1]})` : "No sales yet"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-dashed border-[#e8d9cb] px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                      Batch items
                    </p>
                    <div className="mt-3 space-y-2">
                      {lineItems.filter((line) => line.product.trim()).length === 0 && (
                        <p className="text-sm text-[#9a8b7d]">Nothing added yet.</p>
                      )}
                      {lineItems
                        .filter((line) => line.product.trim())
                        .map((line, index) => (
                          <div
                            key={line.id}
                            className="flex items-start justify-between gap-4 rounded-2xl bg-[#fff4ea] px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-semibold text-[#2b2018]">
                                {index + 1}. {line.product}
                              </p>
                              <p className="text-xs text-[#9a8b7d]">
                                {line.qty} x {formatCurrency(line.unitPrice)}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-[#ff7a1a]">
                              {formatCurrency(line.lineTotal)}
                            </p>
                          </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#efe6dc] bg-white p-6 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[#2b2018]">Recent sales</h2>
                    <p className="mt-1 text-sm text-[#8c7b6d]">
                      Latest entries for the selected branch.
                    </p>
                  </div>
                  <span className="rounded-full bg-[#fff1e3] px-3 py-1 text-[11px] font-semibold text-[#c96f15]">
                    {recentSales.length}
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  {recentSales.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[#e8d9cb] px-4 py-8 text-center text-sm text-[#9a8b7d]">
                      No recent sales yet.
                    </div>
                  )}

                  {recentSales.map((sale) => {
                    const isSelected = correctionDraft?.saleId === sale.id;

                    return (
                      <button
                        key={sale.id}
                        type="button"
                        onClick={() => startCorrection(sale)}
                        aria-pressed={isSelected}
                        aria-label={`Correct ${sale.product} sale`}
                        className={[
                          "w-full rounded-2xl bg-[#fffaf5] px-4 py-3 text-left text-sm transition",
                          isSelected
                            ? "ring-2 ring-[#ffb47b] shadow-[0_10px_24px_-18px_rgba(255,122,26,0.55)]"
                            : "hover:bg-[#fff7ef]"
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#2b2018]">{sale.product}</p>
                            <p className="mt-1 text-xs text-[#9a8b7d]">
                              {sale.branch || "Unassigned branch"} - {formatSaleDate(sale.date)}
                            </p>
                            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c35f18]">
                              Tap to fix
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-semibold text-[#ff7a1a]">
                              {formatCurrency(Number(sale.qty || 0) * Number(sale.price || 0))}
                            </p>
                            <p className="text-xs text-[#9a8b7d]">
                              {isIncludedSaleItem(sale.product)
                                ? "Included with siomai sale"
                                : `${sale.qty} pcs at ${formatCurrency(sale.price)}`}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div
                  ref={correctionPanelRef}
                  className="mt-5 rounded-2xl border border-[#f0dfd0] bg-[#fffaf5] px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                        Fix a line item
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#2b2018]">
                        {correctionDraft
                          ? "Edit the selected line item and save the fix"
                          : "Choose a recent sale line item to edit"}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#c35f18]">
                      Controlled
                    </span>
                  </div>

                  {correctionDraft ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-[#efe6dc] bg-white px-3 py-3 text-sm">
                        <p className="font-semibold text-[#2b2018]">
                          {selectedSaleForCorrection?.product || "Selected sale"}
                        </p>
                        <p className="mt-1 text-xs text-[#9a8b7d]">
                          {getBranchLabel(selectedSaleForCorrection?.branch)} - selected for
                          correction
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="correction-product"
                          className="text-sm font-medium text-[#5a4a3f]"
                        >
                          Product
                        </label>
                        <select
                          id="correction-product"
                          aria-label="Correction Product"
                          value={correctionDraft.product}
                          onChange={(e) =>
                            setCorrectionDraft((prev) =>
                              prev ? { ...prev, product: e.target.value } : prev
                            )
                          }
                          className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                        >
                          <option value="">Choose product</option>
                          {inventoryNameOptions.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="correction-qty"
                          className="text-sm font-medium text-[#5a4a3f]"
                        >
                          Qty
                        </label>
                        <input
                          id="correction-qty"
                          aria-label="Correction Qty"
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={correctionDraft.qty}
                          onChange={(e) =>
                            setCorrectionDraft((prev) =>
                              prev ? { ...prev, qty: e.target.value } : prev
                            )
                          }
                          onFocus={(e) => e.target.select()}
                          className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                        />
                      </div>

                      <div>
                        <label htmlFor="correction-reason" className="text-sm font-medium text-[#5a4a3f]">
                          Reason
                        </label>
                        <input
                          id="correction-reason"
                          aria-label="Reason for correction"
                          type="text"
                          value={correctionDraft.reason}
                          onChange={(e) =>
                            setCorrectionDraft((prev) =>
                              prev ? { ...prev, reason: e.target.value } : prev
                            )
                          }
                          className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                          placeholder="Example: Wrong quantity entered"
                        />
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          aria-label="Save correction"
                          onClick={handleApplyCorrection}
                          className="w-full rounded-xl bg-[#ff7a1a] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00]"
                        >
                          Save fix
                        </button>
                        <button
                          type="button"
                          onClick={() => setCorrectionDraft(null)}
                          className="w-full rounded-xl border border-[#1f1b16] px-5 py-2.5 text-sm font-semibold text-[#1f1b16] transition hover:border-[#3a2d24]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-[#8c7b6d]">
                      Pick a line item from recent sales to adjust the product or quantity without
                      deleting the whole sale.
                    </p>
                  )}
                </div>

                {saleCorrections.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-dashed border-[#e8d9cb] px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                      Recent fixes
                    </p>
                    <div className="mt-3 space-y-2">
                      {saleCorrections.slice(0, 3).map((correction) => (
                        <div key={correction.id} className="rounded-2xl bg-[#fff4ea] px-3 py-2 text-sm">
                          <p className="font-semibold text-[#2b2018]">
                            {correction.product || "Unknown item"}
                          </p>
                          <p className="mt-1 text-xs text-[#9a8b7d]">
                            {getBranchLabel(correction.branch)} - {correction.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
