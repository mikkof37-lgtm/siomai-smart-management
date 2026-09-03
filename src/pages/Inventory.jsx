import { useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { useInventory } from "../context/InventoryContext";
import { useSettings } from "../context/SettingsContext";
import { isAdminOrOwner } from "../utils/authRoles";
import { compareInventoryDisplayOrder } from "../utils/inventoryOrdering";
import {
  getInventoryRulePriceLabel,
  getInventoryRuleHint,
  isInventoryRuleItem
} from "../utils/inventoryItemRules";
import {
  formatInventoryQuantityForDisplay,
  getSiomaiPackDescription,
  isSiomaiItem
} from "../utils/siomaiUnits";

const UNIT_OPTIONS = [
  { value: "pieces", label: "pieces" },
  { value: "packs", label: "packs" },
  { value: "gallon", label: "gallon" },
  { value: "kg", label: "kg" }
];

const SORT_OPTIONS = [
  { value: "manual", label: "Default order" },
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
  { value: "category-asc", label: "Category A-Z" },
  { value: "stock-asc", label: "Stock low to high" },
  { value: "stock-desc", label: "Stock high to low" },
  { value: "price-asc", label: "Price low to high" },
  { value: "price-desc", label: "Price high to low" },
  { value: "low-stock-first", label: "Low stock first" }
];

const normalizeUnit = (unit) => {
  const value = typeof unit === "string" ? unit.trim().toLowerCase() : "";
  return UNIT_OPTIONS.some((option) => option.value === value) ? value : "";
};

const CATEGORY_OPTIONS = ["Finished Goods", "Supplies", "Condiments"];

const ITEM_CODE_PREFIX = "ITEM-";

const getNextItemCode = (items) => {
  const usedNumbers = new Set();

  items.forEach((item) => {
    const match = typeof item.code === "string" ? item.code.trim().match(/^ITEM-(\d+)$/i) : null;
    if (!match) return;

    const number = Number(match[1]);
    if (Number.isFinite(number) && number > 0) {
      usedNumbers.add(number);
    }
  });

  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1;
  }

  return `${ITEM_CODE_PREFIX}${String(nextNumber).padStart(3, "0")}`;
};

const HISTORY_TYPE_LABELS = {
  added: "Added",
  updated: "Updated",
  deleted: "Deleted",
  stock: "Stock Change"
};

const HISTORY_TYPE_STYLES = {
  added: "bg-[#e8f7ee] text-[#1e9e61]",
  updated: "bg-[#e9f2ff] text-[#2f6fed]",
  deleted: "bg-[#ffeceb] text-[#ff4d4f]",
  stock: "bg-[#fff3d8] text-[#c27a1a]"
};

const HISTORY_FILTER_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "added", label: "Added" },
  { value: "updated", label: "Updated" },
  { value: "deleted", label: "Deleted" },
  { value: "stock", label: "Stock change" }
];

const formatHistoryTimestamp = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

export default function Inventory({ onLogout, currentUser }) {

const { inventory, inventoryHistory, setInventory, isLoadingInventory, inventorySyncError } = useInventory();
const { settings } = useSettings();
const canManageInventory = isAdminOrOwner(currentUser);
const [query, setQuery] = useState("");
const [sortBy, setSortBy] = useState("manual");
const [historyQuery, setHistoryQuery] = useState("");
const [historyType, setHistoryType] = useState("all");
const [showForm, setShowForm] = useState(false);
const [form, setForm] = useState({
  name: "",
  code: "",
  category: "",
  stock: "",
  unit: "",
  threshold: "",
  price: "",
  minStock: "",
  maxStock: ""
});
const [formError, setFormError] = useState("");
const [editingItem, setEditingItem] = useState(null);
const [editForm, setEditForm] = useState({
  name: "",
  category: "",
  unit: "",
  price: "",
  stock: "",
  threshold: "",
  minStock: "",
  maxStock: ""
});
const [editError, setEditError] = useState("");
const isEditingSiomai = isSiomaiItem(editingItem || editForm.name);
const isEditingFixedItem = isInventoryRuleItem(editingItem || editForm.name);
const categoryOptions = useMemo(() => {
  const categories = new Set(CATEGORY_OPTIONS);
  inventory.forEach((item) => {
    if (item.category) categories.add(item.category);
  });
  return [...categories].sort((a, b) => a.localeCompare(b));
}, [inventory]);
const filteredHistory = useMemo(() => {
  const q = historyQuery.trim().toLowerCase();

  return inventoryHistory.filter((entry) => {
    const matchesType = historyType === "all" || entry.type === historyType;
    if (!matchesType) return false;

    if (!q) return true;

    return [entry.summary, entry.itemName, entry.itemCode, entry.details]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
}, [historyQuery, historyType, inventoryHistory]);

const recentHistory = useMemo(() => filteredHistory.slice(0, 8), [filteredHistory]);
const totalItems = inventory.length;
const lowStockCount = useMemo(
  () =>
    inventory.filter((item) => item.stock < item.threshold * settings.lowThresholdMultiplier).length,
  [inventory, settings.lowThresholdMultiplier]
);
const criticalStockCount = useMemo(
  () =>
    inventory.filter((item) => item.stock < item.threshold * settings.criticalThresholdPercent).length,
  [inventory, settings.criticalThresholdPercent]
);
const hasFilters = query.trim() !== "" || sortBy !== "manual";
const clearFilters = () => {
  setQuery("");
  setSortBy("manual");
};
const hasHistoryFilters = historyQuery.trim() !== "" || historyType !== "all";
const clearHistoryFilters = () => {
  setHistoryQuery("");
  setHistoryType("all");
};

const filteredItems = useMemo(() => {
  const q = query.trim().toLowerCase();
  if (!q) return inventory;
  return inventory.filter((item) => {
    return (
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q)
    );
  });
}, [inventory, query]);

const organizedItems = useMemo(() => {
  const items = [...filteredItems];
  const getStockState = (item) => ({
    isLow: item.stock < item.threshold * settings.lowThresholdMultiplier,
    isCritical: item.stock < item.threshold * settings.criticalThresholdPercent
  });

  const compareText = (left, right) => left.localeCompare(right, undefined, { sensitivity: "base" });

  switch (sortBy) {
    case "name-asc":
      return items.sort((left, right) => compareText(left.name, right.name));
    case "name-desc":
      return items.sort((left, right) => compareText(right.name, left.name));
    case "category-asc":
      return items.sort((left, right) => {
        const categoryCompare = compareText(left.category, right.category);
        return categoryCompare !== 0 ? categoryCompare : compareText(left.name, right.name);
      });
    case "stock-asc":
      return items.sort((left, right) => left.stock - right.stock || compareText(left.name, right.name));
    case "stock-desc":
      return items.sort((left, right) => right.stock - left.stock || compareText(left.name, right.name));
    case "price-asc":
      return items.sort((left, right) => Number(left.price || 0) - Number(right.price || 0) || compareText(left.name, right.name));
    case "price-desc":
      return items.sort((left, right) => Number(right.price || 0) - Number(left.price || 0) || compareText(left.name, right.name));
    case "low-stock-first":
      return items.sort((left, right) => {
        const leftState = getStockState(left);
        const rightState = getStockState(right);
        if (leftState.isCritical !== rightState.isCritical) return leftState.isCritical ? -1 : 1;
        if (leftState.isLow !== rightState.isLow) return leftState.isLow ? -1 : 1;
        return left.stock - right.stock || compareText(left.name, right.name);
      });
    case "manual":
    default:
      return items.sort(compareInventoryDisplayOrder);
  }
}, [filteredItems, settings.lowThresholdMultiplier, settings.criticalThresholdPercent, sortBy]);

const handleAddItem = (e) => {
  e.preventDefault();
  setFormError("");

  const name = form.name.trim();
  const category = form.category.trim();
  const unit = isSiomaiItem(name)
    ? "packs"
    : isInventoryRuleItem(name)
    ? "pieces"
    : normalizeUnit(form.unit);
  const stock = Number(form.stock);
  const threshold = Number(form.threshold);
  const price = isInventoryRuleItem(name) ? 100 : Number(form.price);
  const minStock = form.minStock === "" ? "" : Number(form.minStock);
  const maxStock = form.maxStock === "" ? "" : Number(form.maxStock);

  if (!name || !category || !unit) {
    setFormError("Please fill in all required fields.");
    return;
  }
  if (!Number.isFinite(stock) || stock < 0) {
    setFormError("Stock must be a valid number.");
    return;
  }
  if (!Number.isFinite(threshold) || threshold < 0) {
    setFormError("Threshold must be a valid number.");
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    setFormError("Price must be a valid number.");
    return;
  }
  if (minStock !== "" && (!Number.isFinite(minStock) || minStock < 0)) {
    setFormError("Minimum stock must be a valid number.");
    return;
  }
  if (maxStock !== "" && (!Number.isFinite(maxStock) || maxStock < 0)) {
    setFormError("Maximum stock must be a valid number.");
    return;
  }

  const nextId =
    inventory.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const finalCode = getNextItemCode(inventory);

  setInventory((prev) => [
    ...prev,
    {
      id: nextId,
      name,
      code: finalCode,
      category,
      unit,
      stock,
      threshold,
      price,
      minStock: minStock === "" ? undefined : minStock,
      maxStock: maxStock === "" ? undefined : maxStock,
      updatedAt: "just now"
    }
  ]);

  setForm({
    name: "",
    code: "",
    category: "",
    stock: "",
    unit: "",
    threshold: "",
    price: "",
    minStock: "",
    maxStock: ""
  });
  setShowForm(false);
};

const openEdit = (item) => {
  if (!canManageInventory) return;
  setEditError("");
  setEditingItem(item);
  setEditForm({
    name: item.name || "",
    category: item.category || "",
    unit: isSiomaiItem(item) ? "packs" : isInventoryRuleItem(item) ? "packs" : normalizeUnit(item.unit),
    price: isInventoryRuleItem(item) ? 100 : item.price ?? "",
    stock: item.stock ?? "",
    threshold: item.threshold ?? "",
    minStock: item.minStock ?? "",
    maxStock: item.maxStock ?? ""
  });
};

const closeEdit = () => {
  setEditingItem(null);
  setEditError("");
};

const handleDelete = (id) => {
  if (!canManageInventory) return;
  setInventory((prev) => prev.filter((item) => item.id !== id));
  if (editingItem && editingItem.id === id) {
    closeEdit();
  }
};

const handleEditSave = (e) => {
  e.preventDefault();
  if (!canManageInventory) return;
  setEditError("");

  const name = editForm.name.trim();
  const category = editForm.category.trim();
  const unit = isSiomaiItem(name)
    ? "packs"
    : isInventoryRuleItem(name)
    ? "pieces"
    : normalizeUnit(editForm.unit);
  const price = isInventoryRuleItem(name) ? 100 : Number(editForm.price);
  const stock = Number(editForm.stock);
  const threshold = Number(editForm.threshold);
  const minStock = editForm.minStock === "" ? "" : Number(editForm.minStock);
  const maxStock = editForm.maxStock === "" ? "" : Number(editForm.maxStock);

  if (!name || !category || !unit) {
    setEditError("Please fill in all required fields.");
    return;
  }
  if (!Number.isFinite(stock) || stock < 0) {
    setEditError("Current stock must be a valid number.");
    return;
  }
  if (!Number.isFinite(threshold) || threshold < 0) {
    setEditError("Reorder point must be a valid number.");
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    setEditError("Unit cost must be a valid number.");
    return;
  }
  if (minStock !== "" && (!Number.isFinite(minStock) || minStock < 0)) {
    setEditError("Minimum stock must be a valid number.");
    return;
  }
  if (maxStock !== "" && (!Number.isFinite(maxStock) || maxStock < 0)) {
    setEditError("Maximum stock must be a valid number.");
    return;
  }

  setInventory((prev) =>
    prev.map((item) => {
      if (item.id !== editingItem.id) return item;
      return {
        ...item,
        name,
        category,
        unit,
        price,
        stock,
        threshold,
        minStock: minStock === "" ? undefined : minStock,
        maxStock: maxStock === "" ? undefined : maxStock,
        updatedAt: "just now"
      };
    })
  );

  closeEdit();
};

return (
<>
<div className="flex min-h-screen flex-col bg-[var(--app-bg)] md:flex-row">

<Sidebar currentUser={currentUser} />

<div className="flex-1">

<TopBar onLogout={onLogout} currentUser={currentUser} />

<div className="px-4 pb-28 pt-4 sm:px-6 sm:pb-28 sm:pt-6 lg:px-8">

<div className="mb-8 rounded-3xl border border-[#efe6dc] bg-white/90 p-6 shadow-[0_18px_50px_-35px_rgba(58,41,29,0.55)] backdrop-blur">
  <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#c27a1a]">
        Inventory Control
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#2b2018]">
        Inventory Management
      </h1>
      <p className="mt-2 text-sm leading-6 text-[#8c7b6d]">
        Track stock levels, manage item details, and review every change from one workspace.
      </p>
      {isLoadingInventory && (
        <p className="mt-3 text-xs font-medium text-[#c27a1a]">
          Loading synced inventory from Supabase...
        </p>
      )}
      {!isLoadingInventory && inventorySyncError && (
        <p className="mt-3 text-xs font-medium text-[#c27a1a]">{inventorySyncError}</p>
      )}
    </div>

    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-[#efe6dc] bg-[#fcfaf7] p-1.5 sm:gap-2 sm:p-2">
        <div className="min-w-0 rounded-xl bg-white px-2 py-1.5 shadow-sm sm:px-3 sm:py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a8b7d] sm:text-[11px] sm:tracking-[0.18em]">
            Items
          </p>
          <p className="mt-1 text-base font-semibold text-[#2b2018] sm:text-lg">{totalItems}</p>
        </div>
        <div className="min-w-0 rounded-xl bg-white px-2 py-1.5 shadow-sm sm:px-3 sm:py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a8b7d] sm:text-[11px] sm:tracking-[0.18em]">
            Low
          </p>
          <p className="mt-1 text-base font-semibold text-[#c27a1a] sm:text-lg">{lowStockCount}</p>
        </div>
        <div className="min-w-0 rounded-xl bg-white px-2 py-1.5 shadow-sm sm:px-3 sm:py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a8b7d] sm:text-[11px] sm:tracking-[0.18em]">
            Very Low
          </p>
          <p className="mt-1 text-base font-semibold text-[#ff4d4f] sm:text-lg">{criticalStockCount}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowForm((prev) => !prev)}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#ff7a1a] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00]"
      >
        <span className="text-base leading-none">+</span>
        {showForm ? "Close Form" : "Add Item"}
      </button>
    </div>
  </div>
</div>

{showForm && (
  <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-6 pb-32 sm:items-center sm:px-6 sm:py-10 sm:pb-10">
    <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#1f1b16]">Add New Item</h2>
        <button
          type="button"
          onClick={() => setShowForm(false)}
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

      <form onSubmit={handleAddItem} className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="add-item-name" className="text-sm font-medium text-[#5a4a3f]">Item Name</label>
            <input
              id="add-item-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="e.g. Pork Siomai"
            />
          </div>
          <div>
            <label htmlFor="add-item-category" className="text-sm font-medium text-[#5a4a3f]">Category</label>
            <select
              id="add-item-category"
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
            >
              <option value="" disabled>
                Select a category
              </option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Unit</label>
            <select
              value={isInventoryRuleItem(form.name) ? "packs" : form.unit}
              onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
              disabled={isSiomaiItem(form.name) || isInventoryRuleItem(form.name)}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
            >
              <option value="" disabled>
                Select a unit
              </option>
              {UNIT_OPTIONS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">
              {isInventoryRuleItem(form.name) ? "Unit Cost (PHP / 50-piece pack)" : "Unit Cost (PHP)"}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Current Stock</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.stock}
              onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="0"
            />
            {(isSiomaiItem(form.name) || isInventoryRuleItem(form.name)) && (
              <p className="mt-2 text-xs text-[#9a8b7d]">
                {isSiomaiItem(form.name)
                  ? `Siomai stock is stored in packs. ${getSiomaiPackDescription(form.name)}.`
                  : `${getInventoryRuleHint(form.name)} Current stock is stored in pieces.`}
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Reorder Point</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.threshold}
              onChange={(e) => setForm((prev) => ({ ...prev, threshold: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="150"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Minimum Stock</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.minStock}
              onChange={(e) => setForm((prev) => ({ ...prev, minStock: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="100"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Maximum Stock</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.maxStock}
              onChange={(e) => setForm((prev) => ({ ...prev, maxStock: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="1000"
            />
          </div>
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="rounded-xl border border-[#1f1b16] px-5 py-2 text-sm font-semibold text-[#1f1b16] transition hover:border-[#3a2d24]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-[#ff7a1a] px-5 py-2 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00]"
          >
            Create Item
          </button>
        </div>
      </form>
    </div>
  </div>
)}

<div className="overflow-hidden rounded-3xl border border-[#efe6dc] bg-white shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
  <div className="border-b border-[#f2eae0] bg-[#fcfaf7] px-6 py-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-[#2b2018]">Inventory List</h2>
          <span className="rounded-full bg-[#f7efe7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
            {organizedItems.length} items
          </span>
        </div>
        <p className="mt-1 text-sm text-[#8c7b6d]">
          Search, sort, and manage items. Use the action buttons for quick edits.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-[#efe6dc] bg-white px-4 py-2 text-sm font-semibold text-[#6f5f52] transition hover:border-[#ffb47b] hover:text-[#ff7a1a]"
          >
            Clear Filters
          </button>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
            Sort
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border border-[#efe6dc] bg-white px-3 py-2 text-sm text-[#2a211a] shadow-sm outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>

    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#efe6dc] bg-white px-4 py-3 shadow-sm">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
        <path
          d="M21 21L16.65 16.65M18 11a7 7 0 11-14 0 7 7 0 0114 0z"
          stroke="#b29c8b"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search items, categories, or codes..."
        className="w-full bg-transparent text-sm text-[#7f6d60] outline-none placeholder:text-[#b8a999]"
      />
    </div>
  </div>

  <div className="hidden md:block">
    <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_0.9fr_96px] border-b border-[#f2eae0] px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#9a8b7d]">
      <div>Item Name</div>
      <div>Category</div>
      <div>Current Stock</div>
      <div>Unit Cost</div>
      <div>Status</div>
      {canManageInventory && <div className="text-right">Actions</div>}
    </div>

    <div className="divide-y divide-[#f4ede4]">
      {organizedItems.map((item) => {
        const isOutOfStock = item.stock === 0;
        const isLow = item.stock < item.threshold * settings.lowThresholdMultiplier;
        const isCritical = item.stock < item.threshold * settings.criticalThresholdPercent;
        const statusLabel = isOutOfStock ? "Out of Stock" : isCritical ? "Very Low" : isLow ? "Low" : "OK";
        const statusClass = isOutOfStock || isCritical
          ? "bg-[#ffeceb] text-[#ff4d4f]"
          : isLow
          ? "bg-[#fff3d8] text-[#c27a1a]"
          : "bg-[#e8f7ee] text-[#1e9e61]";

        return (
          <div
            key={item.id}
            className={`grid items-center px-6 py-4 transition hover:bg-[#fffaf5] ${
              canManageInventory
                ? "grid-cols-[2fr_1.2fr_1fr_1fr_0.9fr_96px]"
                : "grid-cols-[2fr_1.2fr_1fr_1fr_0.9fr]"
            }`}
          >
            <div>
              <div className="font-semibold text-[#2b2018]">{item.name}</div>
              <div className="mt-1 text-xs text-[#b29c8b]">{item.code || "No code"}</div>
            </div>
            <div className="text-sm text-[#8c7b6d]">{item.category}</div>
            <div className="text-sm font-semibold text-[#2b2018]">
              {formatInventoryQuantityForDisplay(
                item,
                item.stock,
                isInventoryRuleItem(item) ? "packs" : item.unit
              )}
            </div>
              <div className="text-sm text-[#8c7b6d]">
                {isInventoryRuleItem(item)
                  ? getInventoryRulePriceLabel(item)
                  : `PHP ${Number(item.price || 0).toFixed(2)}`}
              </div>
            <div>
              <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${statusClass}`}>
                {statusLabel.toUpperCase()}
              </span>
            </div>
            {canManageInventory && (
              <div className="flex justify-end gap-3 text-[#9a8b7d]">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="rounded-full border border-transparent p-2 transition hover:border-[#efe6dc] hover:bg-[#fff8f1] hover:text-[#ff7a1a]"
                  aria-label="Edit item"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                    <path
                      d="M4 20h4l10-10-4-4L4 16v4Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M13 6l4 4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="rounded-full border border-transparent p-2 transition hover:border-[#efe6dc] hover:bg-[#fff6f5] hover:text-[#ff6a5a]"
                  aria-label="Delete item"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                    <path
                      d="M5 7h14M9 7V5h6v2m-7 4v6m4-6v6m4-6v6M7 7l1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>

  <div className="space-y-4 p-4 md:hidden">
    {organizedItems.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-[#e8ddd0] bg-[#fcfaf7] px-5 py-8 text-center text-sm text-[#8c7b6d]">
        No items match your current search or sort options.
      </div>
    ) : (
      organizedItems.map((item) => {
        const isOutOfStock = item.stock === 0;
        const isLow = item.stock < item.threshold * settings.lowThresholdMultiplier;
        const isCritical = item.stock < item.threshold * settings.criticalThresholdPercent;
        const statusLabel = isOutOfStock ? "Out of Stock" : isCritical ? "Very Low" : isLow ? "Low" : "OK";
        const statusClass = isOutOfStock || isCritical
          ? "bg-[#ffeceb] text-[#ff4d4f]"
          : isLow
          ? "bg-[#fff3d8] text-[#c27a1a]"
          : "bg-[#e8f7ee] text-[#1e9e61]";

        return (
          <div key={item.id} className="rounded-2xl border border-[#efe6dc] bg-[#fffdfb] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#2b2018]">{item.name}</h3>
                <p className="mt-1 text-xs text-[#b29c8b]">{item.code || "No code"}</p>
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${statusClass}`}>
                {statusLabel.toUpperCase()}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#9a8b7d]">Category</p>
                <p className="mt-1 text-[#5a4a3f]">{item.category}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#9a8b7d]">Stock</p>
                <p className="mt-1 font-semibold text-[#2b2018]">
                  {formatInventoryQuantityForDisplay(
                    item,
                    item.stock,
                    isInventoryRuleItem(item) ? "packs" : item.unit
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#9a8b7d]">Unit Cost</p>
                <p className="mt-1 text-[#5a4a3f]">
                  {isInventoryRuleItem(item)
                    ? getInventoryRulePriceLabel(item)
                    : `PHP ${Number(item.price || 0).toFixed(2)}`}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#9a8b7d]">Reorder</p>
                <p className="mt-1 text-[#5a4a3f]">
                  {formatInventoryQuantityForDisplay(item, item.threshold, item.unit)}
                </p>
              </div>
            </div>

            {canManageInventory && (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="rounded-xl border border-[#efe6dc] px-3 py-2 text-sm font-semibold text-[#6f5f52] transition hover:border-[#ffb47b] hover:text-[#ff7a1a]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="rounded-xl border border-[#efe6dc] px-3 py-2 text-sm font-semibold text-[#6f5f52] transition hover:border-[#ffc7c2] hover:text-[#ff6a5a]"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })
    )}
  </div>
</div>

<div className="mt-6 rounded-3xl border border-[#efe6dc] bg-white shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f2eae0] bg-[#fcfaf7] px-6 py-4">
    <div>
      <h2 className="text-lg font-semibold text-[#2b2018]">Recent Activity</h2>
      <p className="text-sm text-[#8c7b6d]">Audit trail for inventory changes.</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-[#f7efe7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
        Latest {recentHistory.length}
      </span>
      {hasHistoryFilters && (
        <button
          type="button"
          onClick={clearHistoryFilters}
          className="rounded-full border border-[#efe6dc] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6f5f52] transition hover:border-[#ffb47b] hover:text-[#ff7a1a]"
        >
          Clear Filters
        </button>
      )}
    </div>
  </div>

  <div className="border-b border-[#f4ede4] bg-[#fffdfb] px-6 py-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-3 rounded-2xl border border-[#efe6dc] bg-white px-4 py-3 shadow-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path
              d="M21 21L16.65 16.65M18 11a7 7 0 11-14 0 7 7 0 0114 0z"
              stroke="#b29c8b"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
            placeholder="Search activity, item name, code, or details..."
            className="w-full bg-transparent text-sm text-[#7f6d60] outline-none placeholder:text-[#b8a999]"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {HISTORY_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setHistoryType(option.value)}
              className={[
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                historyType === option.value
                  ? "border-[#ff7a1a] bg-[#fff1e3] text-[#c96f15]"
                  : "border-[#efe6dc] bg-white text-[#6f5f52] hover:border-[#ffb47b] hover:text-[#ff7a1a]"
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>

  <div className="divide-y divide-[#f4ede4] bg-[#fffdfb]">
    {recentHistory.length === 0 ? (
      <div className="px-6 py-8 text-sm text-[#8c7b6d]">
        {inventoryHistory.length === 0
          ? "No inventory changes recorded yet."
          : "No activity matches your current filters."}
      </div>
    ) : (
      recentHistory.map((entry) => {
        const badgeClass = HISTORY_TYPE_STYLES[entry.type] || HISTORY_TYPE_STYLES.updated;
        const badgeLabel = HISTORY_TYPE_LABELS[entry.type] || "Update";

        return (
          <div key={entry.id} className="flex gap-4 px-6 py-4">
            <div className="relative mt-1 h-3 w-3 shrink-0">
              <span className={`absolute inset-0 rounded-full ${badgeClass}`} />
              <span className="absolute left-1/2 top-3 h-[calc(100%+1.5rem)] w-px -translate-x-1/2 bg-[#e9ddd0]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${badgeClass}`}>
                  {badgeLabel}
                </span>
                <p className="font-semibold text-[#2b2018]">{entry.summary}</p>
              </div>
              <p className="mt-1 text-sm text-[#8c7b6d]">
                {entry.itemName}
                {entry.itemCode ? ` - ${entry.itemCode}` : ""}
              </p>
              {entry.details && <p className="mt-1 text-sm leading-6 text-[#6f5f52]">{entry.details}</p>}
            </div>
            <div className="shrink-0 text-right text-xs font-medium uppercase tracking-[0.18em] text-[#b29c8b]">
              {formatHistoryTimestamp(entry.createdAt)}
            </div>
          </div>
        );
      })
    )}
  </div>
</div>

</div>

</div>

</div>

{editingItem && canManageInventory && (
  <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-6 pb-32 sm:items-center sm:px-6 sm:py-10 sm:pb-10">
    <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#1f1b16]">Edit Inventory Item</h2>
        <button
          type="button"
          onClick={closeEdit}
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

      <form onSubmit={handleEditSave} className="mt-6 space-y-4">
        {isEditingSiomai && (
          <div className="rounded-2xl border border-[#f2dfcf] bg-[#fffaf5] px-4 py-3 text-sm text-[#6f5f52]">
            Siomai inventory is managed in packs here.{" "}
            {getSiomaiPackDescription(editingItem || editForm.name)}. Stock, reorder point,
            minimum stock, and maximum stock should stay in packs.
          </div>
        )}
        {isEditingFixedItem && !isEditingSiomai && (
          <div className="rounded-2xl border border-[#f2dfcf] bg-[#fffaf5] px-4 py-3 text-sm text-[#6f5f52]">
            {getInventoryRuleHint(editingItem || editForm.name)}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Item Name</label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="e.g. Pork Siomai"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Category</label>
            <select
              value={editForm.category}
              onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
            >
              <option value="" disabled>
                Select a category
              </option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Unit</label>
            <select
              value={editForm.unit}
              onChange={(e) => setEditForm((prev) => ({ ...prev, unit: e.target.value }))}
              disabled={isEditingSiomai || isEditingFixedItem}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
            >
              <option value="" disabled>
                Select a unit
              </option>
              {UNIT_OPTIONS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">
              {isEditingFixedItem ? "Unit Cost (PHP / 50-piece pack)" : "Unit Cost (PHP)"}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.price}
              onChange={(e) => setEditForm((prev) => ({ ...prev, price: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Current Stock</label>
            <input
              type="number"
              min="0"
              step={isEditingSiomai ? "0.01" : "1"}
              value={editForm.stock}
              onChange={(e) => setEditForm((prev) => ({ ...prev, stock: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Reorder Point</label>
            <input
              type="number"
              min="0"
              step={isEditingSiomai ? "0.01" : "1"}
              value={editForm.threshold}
              onChange={(e) => setEditForm((prev) => ({ ...prev, threshold: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="150"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Minimum Stock</label>
            <input
              type="number"
              min="0"
              step={isEditingSiomai ? "0.01" : "1"}
              value={editForm.minStock}
              onChange={(e) => setEditForm((prev) => ({ ...prev, minStock: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="100"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Maximum Stock</label>
            <input
              type="number"
              min="0"
              step={isEditingSiomai ? "0.01" : "1"}
              value={editForm.maxStock}
              onChange={(e) => setEditForm((prev) => ({ ...prev, maxStock: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="1000"
            />
          </div>
        </div>

        {editError && <p className="text-sm text-red-600">{editError}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeEdit}
            className="rounded-xl border border-[#1f1b16] px-5 py-2 text-sm font-semibold text-[#1f1b16] transition hover:border-[#3a2d24]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-[#ff7a1a] px-5 py-2 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00]"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  </div>
)}

</>
);

}
