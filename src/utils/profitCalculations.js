import { getSaleInventoryQuantity } from "./siomaiUnits";

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function findInventoryItem(sale, inventory) {
  const saleItemId = sale?.inventoryItemId;
  const saleItemName = (
    typeof sale?.inventoryItemName === "string" && sale.inventoryItemName.trim()
      ? sale.inventoryItemName
      : sale?.product
  )
    ?.trim()
    .toLowerCase() || "";

  return inventory.find((item) => {
    if (saleItemId !== undefined && saleItemId !== null && String(item.id) === String(saleItemId)) {
      return true;
    }
    return saleItemName && typeof item.name === "string" && item.name.trim().toLowerCase() === saleItemName;
  });
}

export function getSaleProfitBreakdown(sale, inventory = []) {
  const quantity = toFiniteNumber(sale?.qty);
  const sellingPrice = toFiniteNumber(sale?.price);
  const revenue = quantity * sellingPrice;
  const inventoryItem = findInventoryItem(sale, inventory);

  if (!inventoryItem) {
    return { revenue, cogs: null, grossProfit: null, margin: null };
  }

  const inventoryQuantity = getSaleInventoryQuantity(inventoryItem, quantity);
  const cogs = Math.max(0, inventoryQuantity) * toFiniteNumber(inventoryItem.price);
  const grossProfit = revenue - cogs;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : null;

  return { revenue, cogs, grossProfit, margin };
}

export function summarizeSalesProfit(sales = [], inventory = []) {
  return sales.reduce(
    (summary, sale) => {
      const breakdown = getSaleProfitBreakdown(sale, inventory);
      summary.revenue += breakdown.revenue;
      if (breakdown.cogs === null) {
        summary.unmatchedSales += 1;
        return summary;
      }
      summary.cogs += breakdown.cogs;
      summary.grossProfit += breakdown.grossProfit;
      return summary;
    },
    { revenue: 0, cogs: 0, grossProfit: 0, unmatchedSales: 0 }
  );
}
