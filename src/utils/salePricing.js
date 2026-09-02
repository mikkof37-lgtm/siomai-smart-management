const normalizeText = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const SALE_PRICING_RULES = new Map([
  ["regular pork siomai", { type: "bundle", bundlePrice: 16, bundleQty: 3, saleUnitLabel: "pcs" }],
  ["chicken siomai", { type: "bundle", bundlePrice: 16, bundleQty: 3, saleUnitLabel: "pcs" }],
  ["premium pork siomai", { type: "bundle", bundlePrice: 18, bundleQty: 3, saleUnitLabel: "pcs" }],
  ["paper cups", { type: "unit", unitPrice: 12, saleUnitLabel: "pieces" }],
  ["paper cup", { type: "unit", unitPrice: 12, saleUnitLabel: "pieces" }],
  ["chili oil (gallon)", { type: "included", saleUnitLabel: "gallon" }],
  ["paper tray ( p10 ) ( 100 pcs )", { type: "included", saleUnitLabel: "pieces" }],
  ["paper tray ( p20 ) ( 100 pcs )", { type: "included", saleUnitLabel: "pieces" }],
  ["roasted garlic 1kg", { type: "included", saleUnitLabel: "kg" }],
  ["soy sauce (gallon)", { type: "included", saleUnitLabel: "gallon" }]
]);

function getRule(value) {
  const name = typeof value === "string" ? value : value?.name;
  const normalized = normalizeText(name);
  if (!normalized) return null;
  if (SALE_PRICING_RULES.has(normalized)) {
    return SALE_PRICING_RULES.get(normalized);
  }

  if (normalized.includes("paper") && normalized.includes("cup")) {
    return SALE_PRICING_RULES.get("paper cups") || null;
  }

  if (normalized.includes("paper tray") && normalized.includes("p10")) {
    return SALE_PRICING_RULES.get("paper tray ( p10 ) ( 100 pcs )") || null;
  }

  if (normalized.includes("paper tray") && normalized.includes("p20")) {
    return SALE_PRICING_RULES.get("paper tray ( p20 ) ( 100 pcs )") || null;
  }

  return null;
}

export function getSaleUnitPrice(inventoryItem) {
  if (!inventoryItem) return 0;

  const rule = getRule(inventoryItem);
  if (!rule) {
    return Number(inventoryItem.price || 0);
  }

  if (rule.type === "bundle") {
    return rule.bundlePrice / rule.bundleQty;
  }

  if (rule.type === "included") {
    return 0;
  }

  return rule.unitPrice;
}

export function isIncludedSaleItem(inventoryItem) {
  return getRule(inventoryItem)?.type === "included";
}

export function getSaleQuantityUnitLabel(inventoryItem, fallbackUnit = "units") {
  const rule = getRule(inventoryItem);
  return rule?.saleUnitLabel || fallbackUnit;
}

export function getSalePricingHint(inventoryItem) {
  const rule = getRule(inventoryItem);
  const name = typeof inventoryItem === "string" ? inventoryItem : inventoryItem?.name || "this item";

  if (!rule) {
    return "";
  }

  if (rule.type === "bundle") {
    return `Special pricing: PHP ${rule.bundlePrice.toFixed(2)} per ${rule.bundleQty} pieces for ${name}.`;
  }

  if (rule.type === "included") {
    return "Included with the siomai sale price.";
  }

  return `Special pricing: PHP ${rule.unitPrice.toFixed(2)} per piece for ${name}.`;
}
