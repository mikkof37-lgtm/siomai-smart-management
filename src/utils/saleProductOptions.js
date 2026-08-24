const normalizeText = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const HIDDEN_SALE_PRODUCTS = new Set(["japanese siomai", "special japanese siomai"]);

export function buildUniqueSaleProductOptions(items) {
  if (!Array.isArray(items)) return [];

  const seen = new Set();
  const uniqueItems = [];

  [...items].forEach((item) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const normalizedName = normalizeText(name);

    if (!normalizedName || HIDDEN_SALE_PRODUCTS.has(normalizedName) || seen.has(normalizedName)) {
      return;
    }

    seen.add(normalizedName);
    uniqueItems.push({
      ...item,
      name
    });
  });

  return uniqueItems;
}
