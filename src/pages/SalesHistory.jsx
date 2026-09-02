import { useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { BRANCH_OPTIONS } from "../data/branches";
import { useInventory } from "../context/InventoryContext";
import { useSales } from "../context/SalesContext";
import { isAdminOrOwner } from "../utils/authRoles";
import { compareInventoryDisplayOrder } from "../utils/inventoryOrdering";
import { buildUniqueSaleProductOptions } from "../utils/saleProductOptions";
import {
  getSalePricingHint,
  getSaleQuantityUnitLabel,
  getSaleUnitPrice
} from "../utils/salePricing";
import {
  formatInventoryQuantityForDisplay,
  getSaleInventoryQuantity,
} from "../utils/siomaiUnits";
import { formatSaleDate, normalizeSaleDateValue, saleDateKey } from "../utils/salesDates";

const formatCurrency = (value) => `PHP ${Number(value).toFixed(2)}`;

const toDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeText = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolveInventoryItem = (inventory, productName) => {
  const normalized = normalizeText(productName);
  if (!normalized) return null;

  const directMatch = inventory.find((item) => normalizeText(item.name) === normalized);
  return directMatch || null;
};

const getDefaultRecordForm = () => ({
  branch: "",
  product: "",
  qty: "1",
  price: "0",
  date: toDateInputValue(),
  notes: ""
});

const SALES_PAGE_SIZE = 12;

export default function SalesHistory({ onLogout, currentUser }) {
  const { inventory } = useInventory();
  const {
    salesHistory,
    addSale,
    clearRecordedSales,
    deleteSaleRecord,
    isLoadingSales,
    salesSyncError,
    retrySalesSync
  } = useSales();
  const [showRecord, setShowRecord] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [recordError, setRecordError] = useState("");
  const [recordForm, setRecordForm] = useState(getDefaultRecordForm);
  const [currentPage, setCurrentPage] = useState(1);
  const canManageSalesHistory = isAdminOrOwner(currentUser);

  const inventoryProductOptions = useMemo(() => {
    return buildUniqueSaleProductOptions([...inventory].sort(compareInventoryDisplayOrder)).map((item) => ({
      name: item.name
    }));
  }, [inventory]);

  const selectedInventoryItem = resolveInventoryItem(inventory, recordForm.product);

  const unitPrice = useMemo(() => {
    return getSaleUnitPrice(selectedInventoryItem);
  }, [selectedInventoryItem]);

  const recordTotal = useMemo(() => {
    const qty = Number(recordForm.qty);
    if (!Number.isFinite(qty) || qty <= 0 || !selectedInventoryItem) return 0;
    return qty * unitPrice;
  }, [recordForm.qty, selectedInventoryItem, unitPrice]);

  const resetRecordForm = () => {
    setRecordForm(getDefaultRecordForm());
    setRecordError("");
  };

  const openRecordModal = () => {
    setRecordError("");
    setRecordForm((prev) => ({
      ...getDefaultRecordForm(),
      product: prev.product.trim()
    }));
    setShowRecord(true);
  };

  const handleProductChange = (value) => {
    setRecordForm((prev) => ({
      ...prev,
      product: value
    }));
  };

  const handleRecordSale = (e) => {
    e.preventDefault();
    setRecordError("");

    const branch = recordForm.branch.trim();
    const product = recordForm.product.trim();
    const qty = Number(recordForm.qty);
    const dateValue = recordForm.date;

    if (!branch) {
      setRecordError("Branch is required.");
      return;
    }
    if (!product) {
      setRecordError("Product name is required.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setRecordError("Pieces sold must be a valid number.");
      return;
    }
    if (!selectedInventoryItem) {
      setRecordError("Please choose an exact product from inventory.");
      return;
    }
    const inventoryQty = getSaleInventoryQuantity(selectedInventoryItem, qty);
    if (inventoryQty > Number(selectedInventoryItem.stock || 0)) {
      setRecordError(
        `Not enough stock for ${selectedInventoryItem.name}. Available: ${formatInventoryQuantityForDisplay(
          selectedInventoryItem,
          selectedInventoryItem.stock,
          selectedInventoryItem.unit || "units"
        )}.`
      );
      return;
    }

    const formattedDate = dateValue
      ? normalizeSaleDateValue(dateValue)
      : normalizeSaleDateValue(new Date());

    addSale({
      date: formattedDate,
      branch,
      product,
      qty,
      price: unitPrice,
      notes: recordForm.notes.trim(),
      inventoryItemId: selectedInventoryItem.id,
      inventoryItemName: selectedInventoryItem.name,
      inventoryQty,
      createdAt: new Date().toISOString()
    });

    resetRecordForm();
    setShowRecord(false);
  };

  const toLocalDateKey = (dateValue) => {
    return saleDateKey(dateValue);
  };

  const filteredSales = useMemo(() => {
    return salesHistory.filter((sale) => {
      const matchesDate = !filterDate || toLocalDateKey(sale.date) === filterDate;
      const saleBranch = typeof sale.branch === "string" ? sale.branch.trim() : "";
      const matchesBranch = !filterBranch || saleBranch === filterBranch;
      return matchesDate && matchesBranch;
    });
  }, [filterBranch, filterDate, salesHistory]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / SALES_PAGE_SIZE));
  const activePage = Math.min(currentPage, totalPages);

  const paginatedSales = useMemo(() => {
    const startIndex = (activePage - 1) * SALES_PAGE_SIZE;
    return filteredSales.slice(startIndex, startIndex + SALES_PAGE_SIZE);
  }, [activePage, filteredSales]);

  const pricingHint = selectedInventoryItem
    ? getSalePricingHint(selectedInventoryItem) || `Matched inventory item: ${selectedInventoryItem.name}`
    : "Choose an exact product from inventory to auto-calculate the total.";
  const tableGridClass = canManageSalesHistory
    ? "grid-cols-[1fr_1fr_2fr_0.8fr_1fr_1fr_88px]"
    : "grid-cols-[1fr_1fr_2fr_0.8fr_1fr_1fr]";

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f7f3ee_0%,#f1ebe4_52%,#ece5dc_100%)] md:flex-row">
        <Sidebar currentUser={currentUser} />

        <div className="flex-1">
          <TopBar
            title="Sales History"
            subtitle="Review the ledger, filter by branch, and keep records tidy."
            onLogout={onLogout}
            currentUser={currentUser}
          />

          <div className="px-4 pb-28 pt-4 sm:px-6 sm:pb-28 sm:pt-6 lg:px-8">
            {(isLoadingSales || salesSyncError) && (
              <div
                className={[
                  "mb-6 rounded-2xl border px-4 py-3 text-sm shadow-[var(--shadow-soft)]",
                  salesSyncError
                    ? "border-[#ffd5d0] bg-[#fff4f2] text-[#b0483b]"
                    : "border-[#dcefd8] bg-[#f4fbf1] text-[#2f7a41]"
                ].join(" ")}
              >
                <div className="font-semibold">
                  {isLoadingSales ? "Loading sales from database" : "Sales database status"}
                </div>
                <div className="mt-1">
                  {salesSyncError || "Connected to Supabase and showing live sales."}
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

            <div className="mb-6 overflow-hidden rounded-[28px] border border-[rgba(97,72,56,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(250,246,240,0.96)_55%,rgba(241,236,230,0.92)_100%)] shadow-[var(--shadow-soft)]">
              <div className="px-6 py-6">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b85d11]">
                    Ledger view
                  </div>
                  <h1 className="text-3xl font-semibold text-[var(--app-text)] sm:text-4xl">
                    Review every sale without losing branch context.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--surface-muted)]">
                    Filter by branch, check the day, and fix records when something needs a correction.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[rgba(97,72,56,0.12)] bg-white/90 px-4 py-3 text-sm text-[#6f5f52] shadow-[var(--shadow-soft)]">
                  <label className="text-xs font-semibold text-[var(--surface-muted)]">Date</label>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => {
                      setFilterDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-[#efe5db] bg-white px-2 py-1 text-xs text-[#2a211a] outline-none transition focus:border-[#f46f1a] focus:ring-4 focus:ring-[#ffe2c8]"
                  />
                  {filterDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterDate("");
                        setCurrentPage(1);
                      }}
                      className="text-xs font-semibold text-[#b85d11] hover:text-[#9f4c09]"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[rgba(97,72,56,0.12)] bg-white/90 px-4 py-3 text-sm text-[#6f5f52] shadow-[var(--shadow-soft)]">
                  <label className="text-xs font-semibold text-[var(--surface-muted)]">Branch</label>
                  <select
                    value={filterBranch}
                    onChange={(e) => {
                      setFilterBranch(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-[#efe5db] bg-white px-2 py-1 text-xs text-[#2a211a] outline-none transition focus:border-[#f46f1a] focus:ring-4 focus:ring-[#ffe2c8]"
                  >
                    <option value="">All branches</option>
                    {BRANCH_OPTIONS.map((branch) => (
                      <option key={branch.value} value={branch.value}>
                        {branch.label}
                      </option>
                    ))}
                  </select>
                  {filterBranch && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterBranch("");
                        setCurrentPage(1);
                      }}
                      className="text-xs font-semibold text-[#b85d11] hover:text-[#9f4c09]"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={openRecordModal}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#f46f1a] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ee6310] sm:w-auto"
                >
                  <span className="text-base leading-none">+</span>
                  Add sale
                </button>
                {canManageSalesHistory && (
                  <button
                    type="button"
                    onClick={() => {
                      const confirmed = window.confirm(
                        "Erase all sales history? This will clear the recorded sales from the database and local cache."
                      );
                      if (!confirmed) return;
                      clearRecordedSales();
                    }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[rgba(97,72,56,0.16)] bg-white px-5 py-3 text-sm font-semibold text-[#b85d11] shadow-[var(--shadow-soft)] transition hover:border-[#f46f1a] hover:text-[#9f4c09] sm:w-auto"
                >
                  Clear all
                </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--surface-muted)]">
                <span className="rounded-full bg-white px-3 py-2 shadow-[var(--shadow-soft)]">
                  {filteredSales.length} record{filteredSales.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-full bg-white px-3 py-2 shadow-[var(--shadow-soft)]">
                  Page {activePage} of {totalPages}
                </span>
              </div>
            </div>

            <div className="rounded-[28px] border border-[rgba(97,72,56,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,251,247,0.95)_100%)] shadow-[var(--shadow-soft)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(97,72,56,0.08)] px-6 py-3">
                <p className="text-xs font-semibold text-[var(--surface-muted)]">
                  Showing {filteredSales.length === 0 ? 0 : (activePage - 1) * SALES_PAGE_SIZE + 1}{" "}
                  - {Math.min(activePage * SALES_PAGE_SIZE, filteredSales.length)} of{" "}
                  {filteredSales.length} records
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={activePage === 1}
                    className="rounded-full border border-[rgba(97,72,56,0.16)] bg-white px-4 py-2 text-xs font-semibold text-[#b85d11] transition hover:border-[#f46f1a] hover:text-[#9f4c09] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="rounded-full bg-[var(--accent-soft)] px-4 py-2 text-xs font-semibold text-[#b85d11]">
                    Page {activePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={activePage === totalPages}
                    className="rounded-full border border-[rgba(97,72,56,0.16)] bg-white px-4 py-2 text-xs font-semibold text-[#b85d11] transition hover:border-[#f46f1a] hover:text-[#9f4c09] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="space-y-4 p-4 md:hidden">
                {paginatedSales.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[rgba(97,72,56,0.12)] bg-[#fcfaf7] px-5 py-8 text-center text-sm text-[var(--surface-muted)]">
                    No sales match the selected date or branch.
                  </div>
                ) : (
                  paginatedSales.map((sale) => {
                    const total = sale.qty * sale.price;
                    return (
                      <div key={sale.id} className="rounded-2xl border border-[rgba(97,72,56,0.12)] bg-[#fffdfb] p-4 shadow-[0_12px_32px_-26px_rgba(58,41,29,0.4)]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--surface-muted)]">
                              {formatSaleDate(sale.date)}
                            </p>
                            <h3 className="mt-1 text-[15px] font-semibold leading-5 text-[var(--app-text)]">
                              {sale.product}
                            </h3>
                            <p className="mt-1 text-sm text-[var(--surface-muted)]">{sale.branch || "Unassigned"}</p>
                          </div>
                          <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[#b85d11]">
                            {sale.qty} pcs
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--surface-muted)]">Unit price</p>
                            <p className="mt-1 font-semibold text-[var(--app-text)]">{formatCurrency(sale.price)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--surface-muted)]">Total</p>
                            <p className="mt-1 font-semibold text-[#b85d11]">{formatCurrency(total)}</p>
                          </div>
                        </div>

                        {canManageSalesHistory && (
                          <button
                            type="button"
                            onClick={() => {
                              const confirmed = window.confirm(
                                `Delete ${sale.product} from ${formatSaleDate(sale.date)}?`
                              );
                              if (!confirmed) return;
                              deleteSaleRecord(sale.id);
                            }}
                            className="mt-4 w-full rounded-xl border border-[rgba(97,72,56,0.16)] bg-white px-4 py-2 text-sm font-semibold text-[#b85d11] transition hover:border-[#f46f1a] hover:text-[#9f4c09]"
                            aria-label={`Delete ${sale.product} record`}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="hidden md:block">
                <div
                  className={`grid ${tableGridClass} border-b border-[rgba(97,72,56,0.08)] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--surface-muted)]`}
                >
                  <div>Date</div>
                  <div>Branch</div>
                  <div>Product</div>
                  <div className="text-center">Qty</div>
                  <div className="text-right">Unit price</div>
                  <div className="text-right">Total</div>
                  {canManageSalesHistory && <div className="text-right">Action</div>}
                </div>

                <div className="divide-y divide-[#f4ede4]">
                  {paginatedSales.map((sale) => {
                    const total = sale.qty * sale.price;
                    return (
                      <div
                        key={sale.id}
                        className={`grid ${tableGridClass} items-center px-6 py-4 text-[13px] leading-5`}
                      >
                        <div className="text-[var(--surface-muted)]">{formatSaleDate(sale.date)}</div>
                        <div className="text-[var(--app-text)]">{sale.branch || "Unassigned"}</div>
                        <div className="font-semibold text-[var(--app-text)]">{sale.product}</div>
                        <div className="text-center font-semibold text-[var(--app-text)]">{sale.qty}</div>
                        <div className="text-right text-[var(--surface-muted)]">{formatCurrency(sale.price)}</div>
                        <div className="text-right font-semibold text-[#b85d11]">
                          {formatCurrency(total)}
                        </div>
                        {canManageSalesHistory && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                const confirmed = window.confirm(
                                  `Delete ${sale.product} from ${formatSaleDate(sale.date)}?`
                                );
                                if (!confirmed) return;
                                deleteSaleRecord(sale.id);
                              }}
                              className="rounded-full border border-[rgba(97,72,56,0.16)] bg-white px-3 py-1 text-xs font-semibold text-[#b85d11] transition hover:border-[#f46f1a] hover:text-[#9f4c09]"
                              aria-label={`Delete ${sale.product} record`}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredSales.length === 0 && (
                    <div className="px-6 py-6 text-center text-sm text-[var(--surface-muted)]">
                      No sales match the selected date or branch.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 py-10">
          <div className="w-full max-w-2xl rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,250,245,0.96)_100%)] p-6 shadow-[0_28px_80px_-40px_rgba(24,15,10,0.42)]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--app-text)]">Add sale to ledger</h2>
              <button
                type="button"
                onClick={() => {
                  setShowRecord(false);
                  resetRecordForm();
                }}
                className="text-[#9a8b7d] hover:text-[#6f5f52]"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                  <path
                    d="M6 6l12 12M18 6l-12 12"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-[rgba(97,72,56,0.12)] bg-[#fffaf5] px-4 py-3 text-sm text-[var(--surface-muted)]">
              Enter the branch, product, and quantity. The app will calculate the amount and unit
              price for you.
            </div>

            <form onSubmit={handleRecordSale} className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-[#5a4a3f]">Branch</label>
                <select
                  value={recordForm.branch}
                  onChange={(e) => setRecordForm((prev) => ({ ...prev, branch: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                >
                  <option value="">Choose a branch</option>
                  {BRANCH_OPTIONS.map((branch) => (
                    <option key={branch.value} value={branch.value}>
                      {branch.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-[#5a4a3f]">Product</label>
                <select
                  value={recordForm.product}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                >
                  <option value="">Choose a product</option>
                  {inventoryProductOptions.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-[#9a8b7d]">{pricingHint}</p>
                {selectedInventoryItem && (
                  <p className="mt-1 text-xs text-[#9a8b7d]">
                    Matched inventory item:{" "}
                    <span className="font-semibold text-[#2b2018]">
                      {selectedInventoryItem.name}
                    </span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                <label className="text-sm font-medium text-[#5a4a3f]">Quantity</label>
                {getSaleQuantityUnitLabel(selectedInventoryItem) !== "pieces" && (
                  <p className="mt-1 text-xs text-[#9a8b7d]">
                    {selectedInventoryItem
                      ? getSaleQuantityUnitLabel(selectedInventoryItem) === "pcs"
                        ? "Siomai uses pcs"
                        : `This item is sold in ${getSaleQuantityUnitLabel(selectedInventoryItem)}.`
                      : "Enter the quantity sold"}
                  </p>
                )}
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={recordForm.qty}
                    onChange={(e) => setRecordForm((prev) => ({ ...prev, qty: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#5a4a3f]">Total</label>
                  <input
                    type="text"
                    value={selectedInventoryItem ? formatCurrency(recordTotal) : "Select a product"}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#5a4a3f]">Date</label>
                  <input
                    type="date"
                    value={recordForm.date}
                    onChange={(e) => setRecordForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
                <div>
                  <label className="text-sm font-medium text-[#5a4a3f]">Notes</label>
                  <textarea
                    rows="2"
                    value={recordForm.notes}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                    placeholder="Optional note for this sale"
                  />
                </div>
                <div className="rounded-2xl border border-[#efe6dc] bg-[#fffaf5] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                    Draft preview
                  </div>
                  <div className="mt-2 text-sm text-[#7f6d60]">
                    <div className="flex items-center justify-between">
                      <span>Branch</span>
                      <span className="font-semibold text-[#2b2018]">
                        {recordForm.branch || "Select a branch"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span>Quantity</span>
                      <span className="font-semibold text-[#2b2018]">{recordForm.qty || "0"}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span>Total Amount</span>
                      <span className="font-semibold text-[#2b2018]">
                        {formatCurrency(recordTotal)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-[#f0e3d7] pt-2">
                      <span>Unit price / piece</span>
                      <span className="text-base font-semibold text-[#ff7a1a]">
                        {formatCurrency(unitPrice)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-[#9a8b7d]">
                    The sale matches only an exact inventory item name.
                  </p>
                </div>
              </div>

              {recordError && <p className="text-sm text-red-600">{recordError}</p>}

              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowRecord(false);
                    resetRecordForm();
                  }}
                  className="rounded-xl border border-[#1f1b16] px-5 py-2 text-sm font-semibold text-[#1f1b16] transition hover:border-[#3a2d24]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#ff7a1a] px-5 py-2 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00]"
                >
                  Save sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
