const DEFAULT_SIOMAI_PACK_SIZE = 100;
const PAPER_CUP_PACK_SIZE = 50;
const PACKED_ITEM_RULES = new Map([
  ["regular pork siomai", { packSize: 1000 }],
  ["chicken siomai", { packSize: 1000 }],
  ["premium pork siomai", { packSize: 1000 }],
  ["japanese siomai", { packSize: DEFAULT_SIOMAI_PACK_SIZE }]
]);

const normalizeText = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolveItemName = (value) =>
  typeof value === "string"
    ? value
    : value && typeof value === "object" && typeof value.name === "string"
    ? value.name
    : "";

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getPackSizeForName = (name) => {
  const normalized = normalizeText(resolveItemName(name));
  return PACKED_ITEM_RULES.get(normalized)?.packSize || 1;
};

export function isSiomaiItem(value) {
  return normalizeText(resolveItemName(value)).includes("siomai");
}

export function isPaperCupItem(value) {
  const normalized = normalizeText(resolveItemName(value));
  return normalized.includes("paper") && normalized.includes("cup");
}

export function isPackBasedItem(value) {
  return isSiomaiItem(value);
}

export function getSiomaiPackSize(value) {
  return getPackSizeForName(value);
}

export function getSiomaiPackPrecision(value) {
  const packSize = getSiomaiPackSize(value);
  if (packSize <= 1) return 0;

  let precision = 0;
  let scale = 1;

  while (precision < 6 && scale % packSize !== 0) {
    precision += 1;
    scale *= 10;
  }

  return scale % packSize === 0 ? precision : 0;
}

export function roundSiomaiQuantity(value, itemOrName) {
  const quantity = toFiniteNumber(value, 0);
  const precision = getSiomaiPackPrecision(itemOrName);

  if (precision <= 0) {
    return Math.max(0, quantity);
  }

  const factor = 10 ** precision;
  return Math.max(0, Math.round((quantity + Number.EPSILON) * factor) / factor);
}

export function getSaleInventoryQuantity(itemOrName, saleQty) {
  const qty = toFiniteNumber(saleQty, 0);
  if (isPaperCupItem(itemOrName)) return qty / PAPER_CUP_PACK_SIZE;
  if (!isPackBasedItem(itemOrName)) return qty;

  const packSize = getSiomaiPackSize(itemOrName);
  return roundSiomaiQuantity(qty / packSize, itemOrName);
}

export function getSaleStockDisplayQuantity(itemOrName, inventoryStock) {
  const stock = toFiniteNumber(inventoryStock, 0);
  return isPaperCupItem(itemOrName) ? stock * PAPER_CUP_PACK_SIZE : stock;
}

export function getSaleQuantityUnitLabel(itemOrName, fallbackUnit = "units") {
  return isPackBasedItem(itemOrName) ? "pcs" : fallbackUnit;
}

export function formatInventoryQuantityForDisplay(itemOrName, value, fallbackUnit = "units") {
  const quantity = toFiniteNumber(value, 0);
  const unit = isPackBasedItem(itemOrName) ? "packs" : fallbackUnit;
  const precision = getSiomaiPackPrecision(itemOrName);
  const rounded = isPackBasedItem(itemOrName)
    ? roundSiomaiQuantity(quantity, itemOrName)
    : quantity;

  const formatted =
    precision > 0
      ? rounded
          .toFixed(precision)
          .replace(/\.?0+$/, "")
      : String(rounded);

  return `${formatted} ${unit}`;
}

export function getSiomaiPackDescription(value) {
  const packSize = getSiomaiPackSize(value);
  return `1 pack = ${packSize} pcs`;
}

export function normalizeSiomaiInventoryItem(item) {
  if (!item || typeof item !== "object") return item;

  const name = typeof item.name === "string" ? item.name : "";
  if (!isPackBasedItem(name)) return item;

  const normalized = {
    ...item,
    unit: "packs",
    stock: roundSiomaiQuantity(item.stock, name),
    threshold: roundSiomaiQuantity(item.threshold, name),
    minStock:
      item.minStock === undefined || item.minStock === null
        ? item.minStock
        : roundSiomaiQuantity(item.minStock, name),
    maxStock:
      item.maxStock === undefined || item.maxStock === null
        ? item.maxStock
        : roundSiomaiQuantity(item.maxStock, name)
  };

  const normalizedName = normalizeText(name);
  if (normalizedName === "premium pork siomai") {
    normalized.price = 2950;
  }

  return normalized;
}
