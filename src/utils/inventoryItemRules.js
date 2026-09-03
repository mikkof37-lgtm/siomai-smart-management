const normalizeText = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const formatNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(3).replace(/\.?0+$/, "");
};

const INVENTORY_RULES = new Map([
  ["paper cups", { unit: "pieces", price: 100, packSize: 50 }],
  ["paper cup", { unit: "pieces", price: 100, packSize: 50 }],
  ["spaghetti styro (100 pcs)", { unit: "pieces", price: 140, packSize: 100 }],
  ["paper tray ( p20 ) ( 100 pcs )", { unit: "pieces", price: 130, packSize: 100 }],
  ["paper tray ( p10 ) ( 100 pcs )", { unit: "pieces", price: 110, packSize: 100 }],
  ["soy sauce (gallon)", { unit: "gallon", price: 190, packSize: 1 }],
  ["roasted garlic 1kg", { unit: "kg", price: 160, packSize: 1 }]
]);

function getRule(value) {
  const name = typeof value === "string" ? value : value?.name;
  const normalized = normalizeText(name);
  if (!normalized) return null;
  if (INVENTORY_RULES.has(normalized)) {
    return INVENTORY_RULES.get(normalized);
  }

  if (normalized.includes("paper") && normalized.includes("cup")) {
    return INVENTORY_RULES.get("paper cups") || null;
  }

  if (normalized.includes("spaghetti") && normalized.includes("styro")) {
    return INVENTORY_RULES.get("spaghetti styro (100 pcs)") || null;
  }

  if (normalized.includes("paper tray") && normalized.includes("p20")) {
    return INVENTORY_RULES.get("paper tray ( p20 ) ( 100 pcs )") || null;
  }

  if (normalized.includes("paper tray") && normalized.includes("p10")) {
    return INVENTORY_RULES.get("paper tray ( p10 ) ( 100 pcs )") || null;
  }

  return null;
}

export function isInventoryRuleItem(value) {
  return Boolean(getRule(value));
}

export function getInventoryRuleHint(value) {
  const rule = getRule(value);
  const name = typeof value === "string" ? value : value?.name || "this item";

  if (!rule) return "";

  if (rule.packSize > 1) {
    return `${name} is displayed in packs. Restocking costs PHP ${Number(rule.price || 0).toFixed(
      2
    )} per pack of ${rule.packSize} pcs. Current stock is stored in pieces.`;
  }

  return `${name} is fixed at PHP ${Number(rule.price || 0).toFixed(2)} per ${rule.unit}.`;
}

export function getInventoryRulePriceLabel(value) {
  const rule = getRule(value);
  if (!rule) return "";

  return `PHP ${Number(rule.price || 0).toFixed(2)}`;
}

export function getInventoryRulePrice(value) {
  return getRule(value)?.price ?? null;
}

export function getInventoryRuleUnit(value) {
  return getRule(value)?.unit || "";
}

export function getInventoryRulePackSize(value) {
  return getRule(value)?.packSize || 1;
}

export function formatInventoryRuleStock(value, item) {
  const rule = getRule(item);
  if (!rule) return "";
  if (rule.packSize > 1) return `${formatNumber(Number(value || 0) / rule.packSize)} packs`;
  return `${formatNumber(value)} ${rule.unit}`;
}

export function applyInventoryItemRules(item) {
  if (!item || typeof item !== "object") return item;

  const rule = getRule(item);
  if (!rule) return item;

  return {
    ...item,
    unit: rule.unit,
    price: rule.price
  };
}
