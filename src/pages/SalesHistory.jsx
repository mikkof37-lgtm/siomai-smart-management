import { useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { useInventory } from "../context/InventoryContext";
import { useSales } from "../context/SalesContext";
import { isAdminOrOwner } from "../utils/authRoles";

const formatCurrency = (value) => `PHP ${Number(value).toFixed(2)}`;

const toDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (dateValue) => {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
};

const SALE_PRICE_RULES = [
  {
    name: "Regular Pork Siomai",
    piecesPerBundle: 3,
    bundlePrice: 16
  },
  {
    name: "Chicken Siomai",
    piecesPerBundle: 3,
    bundlePrice: 16
  },
  {
    name: "Premium Pork Siomai",
    piecesPerBundle: 3,
    bundlePrice: 18
  },
  {
    name: "Special Japanese Siomai",
    piecesPerBundle: 3,
    bundlePrice: 20
  }
];

const PRODUCT_INVENTORY_ALIASES = {
  "regular pork siomai": "Pork Siomai (Premium)",
  "premium pork siomai": "Pork Siomai (Premium)",
  "chicken siomai": "Chicken Siomai",
  "special japanese siomai": "Japanese Siomai"
};

const normalizeText = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolveInventoryItem = (inventory, productName) => {
  const normalized = normalizeText(productName);
  if (!normalized) return null;

  const directMatch = inventory.find((item) => normalizeText(item.name) === normalized);
  if (directMatch) return directMatch;

  const aliasName = PRODUCT_INVENTORY_ALIASES[normalized];
  if (!aliasName) return null;

  return inventory.find((item) => normalizeText(item.name) === normalizeText(aliasName)) || null;
};

const getDefaultRecordForm = () => ({
  product: "",
  qty: "1",
  price: "0",
  date: toDateInputValue(),
  notes: ""
});

export default function SalesHistory({ onLogout, currentUser }) {
  const { inventory } = useInventory();
  const { salesHistory, addSale, clearRecordedSales, deleteSaleRecord } = useSales();
  const [showRecord, setShowRecord] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [recordError, setRecordError] = useState("");
  const [recordForm, setRecordForm] = useState(getDefaultRecordForm);
  const canManageSalesHistory = isAdminOrOwner(currentUser);

  const inventoryProductOptions = useMemo(() => {
    return inventory.map((item) => ({
      name: item.name
    }));
  }, [inventory]);

  const productSuggestions = useMemo(() => {
    const merged = new Map();

    [...inventoryProductOptions, ...SALE_PRICE_RULES].forEach((item) => {
      const key = item.name.trim().toLowerCase();
      if (!key || merged.has(key)) return;
      merged.set(key, item);
    });

    return Array.from(merged.values());
  }, [inventoryProductOptions]);

  const selectedPricingRule = useMemo(() => {
    const current = normalizeText(recordForm.product);
    if (!current) return null;
    return (
      SALE_PRICE_RULES.find((item) => item.name.toLowerCase() === current) ||
      SALE_PRICE_RULES.find((item) => current.includes(item.name.toLowerCase())) ||
      null
    );
  }, [recordForm.product]);

  const unitPrice = useMemo(() => {
    const qty = Number(recordForm.qty);
    if (!Number.isFinite(qty) || qty <= 0 || !selectedPricingRule) return 0;
    return selectedPricingRule.bundlePrice / selectedPricingRule.piecesPerBundle;
  }, [recordForm.qty, selectedPricingRule]);

  const recordTotal = useMemo(() => {
    const qty = Number(recordForm.qty);
    if (!Number.isFinite(qty) || qty <= 0 || !selectedPricingRule) return 0;
    return qty * unitPrice;
  }, [recordForm.qty, selectedPricingRule, unitPrice]);

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
    setRecordForm((prev) => {
      return {
        ...prev,
        product: value
      };
    });
  };

  const handleRecordSale = (e) => {
    e.preventDefault();
    setRecordError("");

    const product = recordForm.product.trim();
    const qty = Number(recordForm.qty);
    const dateValue = recordForm.date;

    if (!product) {
      setRecordError("Product name is required.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setRecordError("Pieces sold must be a valid number.");
      return;
    }
    if (!selectedPricingRule) {
      setRecordError("Please choose a product with a preset sale price.");
      return;
    }
    if (!selectedInventoryItem) {
      setRecordError("Please choose a product that exists in inventory.");
      return;
    }
    if (selectedInventoryItem.stock < qty) {
      setRecordError(
        `Not enough stock for ${selectedInventoryItem.name}. Available: ${selectedInventoryItem.stock}.`
      );
      return;
    }

    const formattedDate = dateValue
      ? formatDisplayDate(dateValue)
      : formatDisplayDate(new Date());

    addSale({
      date: formattedDate,
      product,
      qty,
      price: unitPrice,
      notes: recordForm.notes.trim(),
      inventoryItemId: selectedInventoryItem.id,
      inventoryItemName: selectedInventoryItem.name,
      inventoryQty: qty
    });

    resetRecordForm();
    setShowRecord(false);
  };

  const toLocalDateKey = (dateValue) => {
    if (!dateValue) return "";
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleDateString("en-CA");
  };

  const filteredSales = useMemo(() => {
    if (!filterDate) return salesHistory;
    return salesHistory.filter((sale) => toLocalDateKey(sale.date) === filterDate);
  }, [filterDate, salesHistory]);

  const pricingHint = selectedPricingRule
    ? `${selectedPricingRule.piecesPerBundle} pcs = PHP ${selectedPricingRule.bundlePrice}`
    : "Choose a product to auto-calculate the total.";
  const tableGridClass = canManageSalesHistory
    ? "grid-cols-[1.1fr_2fr_0.8fr_1fr_1fr_88px]"
    : "grid-cols-[1.1fr_2fr_0.8fr_1fr_1fr]";
  const selectedInventoryItem = resolveInventoryItem(inventory, recordForm.product);

  return (
    <>
      <div className="flex min-h-screen bg-[#fbf8f4]">
        <Sidebar onLogout={onLogout} />

        <div className="flex-1">
          <TopBar />

          <div className="px-8 pb-10 pt-6">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold text-[#2b2018]">Sales History</h1>
                <p className="text-sm text-[#8c7b6d]">
                  View past transactions and record new sales quickly.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border border-[#efe6dc] bg-white px-4 py-2 text-sm text-[#6f5f52] shadow-sm">
                  <label className="text-xs font-semibold text-[#9a8b7d]">Filter date</label>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="rounded-lg border border-[#efe5db] bg-white px-2 py-1 text-xs text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                  />
                  {filterDate && (
                    <button
                      type="button"
                      onClick={() => setFilterDate("")}
                      className="text-xs font-semibold text-[#ff7a1a] hover:text-[#ff6a00]"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openRecordModal}
                  className="inline-flex items-center gap-2 rounded-full bg-[#ff7a1a] px-5 py-2 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00]"
                >
                  <span className="text-base leading-none">+</span>
                  Record Sale
                </button>
                {canManageSalesHistory && (
                  <button
                    type="button"
                    onClick={() => {
                      const confirmed = window.confirm(
                        "Erase all sales history? This will clear the recorded sales and hide the seeded demo rows."
                      );
                      if (!confirmed) return;
                      clearRecordedSales();
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-[#efc9b4] bg-white px-5 py-2 text-sm font-semibold text-[#c35f18] shadow-sm transition hover:border-[#ffb47b] hover:text-[#ff6a00]"
                  >
                    Erase All Sales
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[#efe6dc] bg-white shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <div
                className={`grid ${tableGridClass} border-b border-[#f2eae0] px-6 py-3 text-xs font-semibold text-[#9a8b7d]`}
              >
                <div>Date</div>
                <div>Product Name</div>
                <div className="text-center">Quantity</div>
                <div className="text-right">Unit Price</div>
                <div className="text-right">Total Revenue</div>
                {canManageSalesHistory && <div className="text-right">Action</div>}
              </div>

              <div className="divide-y divide-[#f4ede4]">
                {filteredSales.map((sale) => {
                  const total = sale.qty * sale.price;
                  return (
                    <div
                      key={sale.id}
                      className={`grid ${tableGridClass} items-center px-6 py-3 text-sm`}
                    >
                      <div className="text-[#8c7b6d]">{sale.date}</div>
                      <div className="font-semibold text-[#2b2018]">{sale.product}</div>
                      <div className="text-center font-semibold text-[#2b2018]">{sale.qty}</div>
                      <div className="text-right text-[#8c7b6d]">{formatCurrency(sale.price)}</div>
                      <div className="text-right font-semibold text-[#ff7a1a]">
                        {formatCurrency(total)}
                      </div>
                      {canManageSalesHistory && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              const confirmed = window.confirm(
                                `Delete ${sale.product} from ${sale.date}?`
                              );
                              if (!confirmed) return;
                              deleteSaleRecord(sale.id);
                            }}
                            className="rounded-full border border-[#efc9b4] bg-white px-3 py-1 text-xs font-semibold text-[#c35f18] transition hover:border-[#ffb47b] hover:text-[#ff6a00]"
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
                  <div className="px-6 py-6 text-center text-sm text-[#9a8b7d]">
                    No sales found for the selected date.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 py-10">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#1f1b16]">Record New Sale</h2>
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

            <div className="mt-4 rounded-2xl border border-[#f2eae0] bg-[#fffaf5] px-4 py-3 text-sm text-[#7f6d60]">
              Enter how many pieces were sold and choose the product. The app will calculate the total
              amount and unit price for you.
            </div>

            <form onSubmit={handleRecordSale} className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-[#5a4a3f]">Product Name</label>
                <select
                  value={recordForm.product}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                >
                  <option value="">Choose a product</option>
                  {productSuggestions.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-[#9a8b7d]">{pricingHint}</p>
                {selectedPricingRule && (
                  <p className="mt-1 text-xs text-[#9a8b7d]">
                    Matched pricing:{" "}
                    <span className="font-semibold text-[#2b2018]">
                      {selectedPricingRule.piecesPerBundle} pieces for PHP {selectedPricingRule.bundlePrice}
                    </span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-[#5a4a3f]">Pieces Sold</label>
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
                  <label className="text-sm font-medium text-[#5a4a3f]">Total Amount (PHP)</label>
                  <input
                    type="text"
                    value={selectedPricingRule ? formatCurrency(recordTotal) : "Select a product"}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#5a4a3f]">Sale Date</label>
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
                  <label className="text-sm font-medium text-[#5a4a3f]">Notes (Optional)</label>
                  <textarea
                    rows="2"
                    value={recordForm.notes}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                    placeholder="Bulk discount applied, special request, etc."
                  />
                </div>
                <div className="rounded-2xl border border-[#efe6dc] bg-[#fffaf5] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                    Preview
                  </div>
                  <div className="mt-2 text-sm text-[#7f6d60]">
                    <div className="flex items-center justify-between">
                      <span>Pieces Sold</span>
                      <span className="font-semibold text-[#2b2018]">{recordForm.qty || "0"}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span>Total Amount</span>
                      <span className="font-semibold text-[#2b2018]">
                        {formatCurrency(recordTotal)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-[#f0e3d7] pt-2">
                      <span>Unit Price / Piece</span>
                      <span className="text-base font-semibold text-[#ff7a1a]">
                        {formatCurrency(unitPrice)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-[#9a8b7d]">
                    Example: `3 pieces` of `Regular Pork Siomai` becomes `PHP 16.00` total.
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
                  Record Sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
