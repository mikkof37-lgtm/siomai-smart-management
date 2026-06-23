import { useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { useInventory } from "../context/InventoryContext";
import { useSettings } from "../context/SettingsContext";

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

export default function Inventory({ onLogout }) {

const { inventory, setInventory } = useInventory();
const { settings } = useSettings();
const [query, setQuery] = useState("");
const [sortBy, setSortBy] = useState("manual");
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
      return items;
  }
}, [filteredItems, settings.lowThresholdMultiplier, settings.criticalThresholdPercent, sortBy]);

const handleAddItem = (e) => {
  e.preventDefault();
  setFormError("");

  const name = form.name.trim();
  const code = form.code.trim();
  const category = form.category.trim();
  const unit = normalizeUnit(form.unit);
  const stock = Number(form.stock);
  const threshold = Number(form.threshold);
  const price = Number(form.price);
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
  const finalCode = code || `ITEM-${String(nextId).padStart(3, "0")}`;

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
  setEditError("");
  setEditingItem(item);
  setEditForm({
    name: item.name || "",
    category: item.category || "",
    unit: normalizeUnit(item.unit),
    price: item.price ?? "",
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
  setInventory((prev) => prev.filter((item) => item.id !== id));
  if (editingItem && editingItem.id === id) {
    closeEdit();
  }
};

const handleEditSave = (e) => {
  e.preventDefault();
  setEditError("");

  const name = editForm.name.trim();
  const category = editForm.category.trim();
  const unit = normalizeUnit(editForm.unit);
  const price = Number(editForm.price);
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
<div className="flex min-h-screen bg-[#fbf8f4]">

<Sidebar onLogout={onLogout}/>

<div className="flex-1">

<TopBar/>

<div className="px-8 pb-10 pt-6">

<div className="flex flex-wrap items-center justify-between gap-4 mb-8">
  <div>
    <h1 className="text-2xl font-semibold text-[#2b2018]">Inventory Management</h1>
    <p className="text-sm text-[#8c7b6d]">Track and manage all warehouse stock.</p>
  </div>
  <button
    type="button"
    onClick={() => setShowForm((prev) => !prev)}
    className="inline-flex items-center gap-2 rounded-full bg-[#ff7a1a] px-5 py-2 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00]"
  >
    <span className="text-base leading-none">+</span>
    {showForm ? "Close" : "Add Item"}
  </button>
</div>

{showForm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 py-10">
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
            <label className="text-sm font-medium text-[#5a4a3f]">Item Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="e.g. Pork Siomai"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Category</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="e.g. Raw Material"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Unit</label>
            <select
              value={form.unit}
              onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
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
            <label className="text-sm font-medium text-[#5a4a3f]">Unit Cost (PHP)</label>
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

<div className="rounded-2xl border border-[#efe6dc] bg-white shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
  <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-[#f2eae0]">
    <div className="flex items-center gap-2 rounded-xl border border-[#efe6dc] bg-white px-3 py-2 shadow-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M21 21L16.65 16.65M18 11a7 7 0 11-14 0 7 7 0 0114 0z" stroke="#b29c8b" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items or categories..."
          className="bg-transparent outline-none text-sm text-[#7f6d60] w-64"
        />
    </div>
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
        Organize
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

  <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_0.9fr_80px] text-xs font-semibold text-[#9a8b7d] px-6 py-3 border-b border-[#f2eae0]">
    <div>Item Name</div>
    <div>Category</div>
    <div>Current Stock</div>
    <div>Unit Cost</div>
    <div>Status</div>
    <div className="text-right">Actions</div>
  </div>

  <div className="divide-y divide-[#f4ede4]">
    {organizedItems.map(item => {
      const isOutOfStock = item.stock === 0;
      const isLow = item.stock < item.threshold * settings.lowThresholdMultiplier;
      const isCritical = item.stock < item.threshold * settings.criticalThresholdPercent;
      const statusLabel = isOutOfStock ? "Out of Stock" : isCritical ? "Critical" : isLow ? "Low" : "OK";
      const statusClass = isOutOfStock || isCritical
        ? "bg-[#ffeceb] text-[#ff4d4f]"
        : isLow
        ? "bg-[#fff3d8] text-[#c27a1a]"
        : "bg-[#e8f7ee] text-[#1e9e61]";

      return (
        <div key={item.id} className="grid grid-cols-[2fr_1.2fr_1fr_1fr_0.9fr_80px] items-center px-6 py-4">
          <div className="font-semibold text-[#2b2018]">{item.name}</div>
          <div className="text-sm text-[#8c7b6d]">{item.category}</div>
          <div className="text-sm font-semibold text-[#2b2018]">
            {item.stock} {item.unit}
          </div>
          <div className="text-sm text-[#8c7b6d]">
            PHP {Number(item.price || 0).toFixed(2)}
          </div>
          <div>
            <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${statusClass}`}>
              {statusLabel.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-end gap-3 text-[#9a8b7d]">
            <button
              type="button"
              onClick={() => openEdit(item)}
              className="hover:text-[#ff7a1a]"
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
              className="hover:text-[#ff6a5a]"
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
        </div>
      );
    })}
  </div>
</div>

</div>

</div>

</div>

{editingItem && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 py-10">
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
            <input
              type="text"
              value={editForm.category}
              onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
              placeholder="e.g. Raw Material"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#5a4a3f]">Unit</label>
            <select
              value={editForm.unit}
              onChange={(e) => setEditForm((prev) => ({ ...prev, unit: e.target.value }))}
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
            <label className="text-sm font-medium text-[#5a4a3f]">Unit Cost (PHP)</label>
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
              step="1"
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
              step="1"
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
              step="1"
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
              step="1"
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
