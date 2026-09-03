const normalizeText = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const INVENTORY_RULES = new Map([
  ["paper cups", { unit: "pieces", price: 100, packSize: 50 }],
  ["paper cup", { unit: "pieces", price: 100, packSize: 50 }]
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

  return null;
}

export function isInventoryRuleItem(value) {
  return Boolean(getRule(value));
}

export function getInventoryRuleHint(value) {
  const rule = getRule(value);
  const name = typeof value === "string" ? value : value?.name || "this item";

  if (!rule) return "";

  return `${name} is displayed in packs. Restocking costs PHP ${Number(rule.price || 0).toFixed(
    2
  )} per pack of ${rule.packSize} pcs.`;
}

export function getInventoryRulePriceLabel(value) {
  const rule = getRule(value);
  if (!rule) return "";

  return `PHP ${Number(rule.price || 0).toFixed(2)}`;
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
