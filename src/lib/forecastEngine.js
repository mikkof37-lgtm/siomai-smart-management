const DEFAULT_MODEL = "gpt-5.5";
const HORIZON_OPTIONS = [7, 14, 30];
const DAY_MS = 24 * 60 * 60 * 1000;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeDate(value) {
  if (typeof value === "string") {
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]) - 1;
      const day = Number(dateOnlyMatch[3]);
      const localDate = new Date(year, month, day);
      return Number.isNaN(localDate.getTime()) ? null : localDate;
    }
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeLabel(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSales(salesHistory) {
  if (!Array.isArray(salesHistory)) return [];

  return salesHistory
    .map((sale, index) => {
      if (!sale || typeof sale !== "object") return null;

      const parsedDate = safeDate(sale.date);
      if (!parsedDate) return null;

      const inventoryItemId =
        sale.inventoryItemId ?? sale.inventory_item_id ?? sale.inventory_itemid ?? null;

      const name =
        normalizeLabel(sale.inventoryItemName) ||
        normalizeLabel(sale.inventory_item_name) ||
        normalizeLabel(sale.product) ||
        "Unspecified item";

      return {
        id: sale.id ?? `sale-${index}`,
        date: parsedDate,
        product: name,
        qty: Math.max(0, toNumber(sale.qty)),
        price: Math.max(0, toNumber(sale.price)),
        inventoryItemId:
          inventoryItemId === null || inventoryItemId === undefined
            ? null
            : String(inventoryItemId),
        inventoryItemName: name
      };
    })
    .filter(Boolean)
    .filter((sale) => sale.qty > 0);
}

function normalizeInventory(inventory) {
  if (!Array.isArray(inventory)) return [];

  return inventory
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;

      const name = normalizeLabel(item.name) || `Item ${index + 1}`;
      const id = item.id ?? `item-${index}`;

      return {
        id: String(id),
        name,
        stock: Math.max(0, toNumber(item.stock)),
        threshold: Math.max(0, toNumber(item.threshold)),
        unit: normalizeLabel(item.unit),
        maxStock: item.maxStock === undefined || item.maxStock === null ? null : toNumber(item.maxStock)
      };
    })
    .filter(Boolean);
}

function buildSalesLookup(sales) {
  const byDay = new Map();
  const byItem = new Map();

  sales.forEach((sale) => {
    const dayKey = toIsoDate(sale.date);
    const currentDay = byDay.get(dayKey) || { units: 0, revenue: 0 };
    currentDay.units += sale.qty;
    currentDay.revenue += sale.qty * sale.price;
    byDay.set(dayKey, currentDay);

    const itemKey = sale.inventoryItemId ? `id:${sale.inventoryItemId}` : `name:${sale.product.toLowerCase()}`;
    const currentItem = byItem.get(itemKey) || {
      key: itemKey,
      name: sale.product,
      inventoryItemId: sale.inventoryItemId,
      units: 0,
      revenue: 0,
      lastSoldAt: sale.date
    };
    currentItem.units += sale.qty;
    currentItem.revenue += sale.qty * sale.price;
    if (sale.date.getTime() > currentItem.lastSoldAt.getTime()) {
      currentItem.lastSoldAt = sale.date;
    }
    byItem.set(itemKey, currentItem);
  });

  return { byDay, byItem };
}

export function buildForecastContext({ salesHistory, inventory, horizonDays }) {
  const horizon = HORIZON_OPTIONS.includes(Number(horizonDays)) ? Number(horizonDays) : 14;
  const normalizedSales = normalizeSales(salesHistory);
  const normalizedInventory = normalizeInventory(inventory);
  const { byDay, byItem } = buildSalesLookup(normalizedSales);

  const latestSaleDate = normalizedSales.reduce((latest, sale) => {
    if (!latest || sale.date.getTime() > latest.getTime()) return sale.date;
    return latest;
  }, null);

  const anchorDate = startOfDay(latestSaleDate || new Date());
  const windowDays = 30;
  const windowStart = addDays(anchorDate, -(windowDays - 1));
  const dailySeries = [];

  for (let index = 0; index < windowDays; index += 1) {
    const date = addDays(windowStart, index);
    const dayKey = toIsoDate(date);
    const totals = byDay.get(dayKey) || { units: 0, revenue: 0 };
    dailySeries.push({
      date: dayKey,
      units: totals.units,
      revenue: totals.revenue
    });
  }

  const totalUnits = normalizedSales.reduce((sum, sale) => sum + sale.qty, 0);
  const totalRevenue = normalizedSales.reduce((sum, sale) => sum + sale.qty * sale.price, 0);
  const recent7 = dailySeries.slice(-7).reduce((sum, day) => sum + day.units, 0);
  const prior7 = dailySeries.slice(-14, -7).reduce((sum, day) => sum + day.units, 0);
  const trendPct = prior7 > 0 ? (recent7 - prior7) / prior7 : recent7 > 0 ? 1 : 0;
  const dailyAverage = totalUnits > 0 ? totalUnits / windowDays : 0;

  const itemSales = Array.from(byItem.values())
    .sort((left, right) => right.units - left.units)
    .slice(0, 10)
    .map((entry) => {
      const inventoryMatch = normalizedInventory.find((item) => {
        if (entry.inventoryItemId && String(item.id) === String(entry.inventoryItemId)) {
          return true;
        }
        return item.name.trim().toLowerCase() === entry.name.trim().toLowerCase();
      });

      return {
        key: entry.key,
        name: inventoryMatch?.name || entry.name,
        units: entry.units,
        revenue: entry.revenue,
        lastSoldAt: toIsoDate(entry.lastSoldAt),
        inventoryItemId: inventoryMatch?.id ?? entry.inventoryItemId ?? null,
        stock: inventoryMatch?.stock ?? null,
        threshold: inventoryMatch?.threshold ?? null,
        unit: inventoryMatch?.unit ?? ""
      };
    });

  const lowStockItems = normalizedInventory
    .map((item) => {
      const buffer = Math.max(1, item.threshold * 0.25);
      return {
        ...item,
        isLow: item.stock <= item.threshold + buffer,
        shortage: Math.max(0, Math.ceil(item.threshold - item.stock))
      };
    })
    .filter((item) => item.isLow)
    .sort((left, right) => right.shortage - left.shortage || left.stock - right.stock)
    .slice(0, 8);

  return {
    horizonDays: horizon,
    generatedAt: new Date().toISOString(),
    salesCount: normalizedSales.length,
    inventoryCount: normalizedInventory.length,
    totalUnits,
    totalRevenue,
    dailyAverage,
    recent7,
    prior7,
    trendPct,
    anchorDate: toIsoDate(anchorDate),
    dailySeries,
    itemSales,
    lowStockItems,
    inventory: normalizedInventory
  };
}

function buildDemandSeries(context, horizonDays, multiplier, confidence) {
  const series = [];
  const baseDaily = context.dailyAverage > 0 ? context.dailyAverage : context.lowStockItems.length > 0 ? 1.5 : 0;
  const weekdayBoost = [0.94, 0.98, 1, 1.02, 1.06, 1.1, 0.9];

  for (let offset = 1; offset <= horizonDays; offset += 1) {
    const date = addDays(new Date(context.generatedAt), offset);
    const seasonalBoost = weekdayBoost[date.getDay()] || 1;
    const drift = 1 + Math.min(0.12, Math.max(-0.12, context.trendPct * (offset / Math.max(horizonDays, 1)) * 0.35));
    const predictedUnits = Math.max(0, Math.round(baseDaily * multiplier * seasonalBoost * drift));
    const dayConfidence = clamp(Math.round(confidence - Math.abs(offset - horizonDays / 2) * 0.7), 35, 96);

    series.push({
      date: toIsoDate(date),
      predictedUnits,
      confidence: dayConfidence
    });
  }

  return series;
}

function buildRecommendations(context, demandSeries) {
  const predictedTotal = demandSeries.reduce((sum, entry) => sum + entry.predictedUnits, 0);
  const itemShares = new Map();

  context.itemSales.forEach((item) => {
    itemShares.set(item.key, context.totalUnits > 0 ? item.units / context.totalUnits : 0);
  });

  const candidates = [];

  context.itemSales.forEach((item) => {
    const share = itemShares.get(item.key) || 0;
    const predictedDemand = Math.round(predictedTotal * share);
    const safetyStock = Math.max(
      Math.ceil((item.threshold ?? 0) * 1.5),
      Math.ceil(predictedDemand * 0.15),
      1
    );
    const currentStock = toNumber(item.stock, 0);
    const recommendedOrderQty = Math.max(0, predictedDemand + safetyStock - currentStock);

    if (recommendedOrderQty > 0 || currentStock <= (item.threshold ?? 0)) {
      candidates.push({
        itemName: item.name,
        currentStock,
        predictedDemand,
        recommendedOrderQty,
        unit: item.unit || "units",
        reason:
          share > 0
            ? `Recent sales make up ${(share * 100).toFixed(1)}% of tracked demand.`
            : "Demand was estimated from overall sales volume and current stock levels."
      });
    }
  });

  context.lowStockItems.forEach((item) => {
    if (candidates.some((candidate) => candidate.itemName === item.name)) return;
    const predictedDemand = Math.max(Math.round(context.dailyAverage * context.horizonDays * 0.25), item.threshold);
    const recommendedOrderQty = Math.max(0, predictedDemand + Math.ceil(item.threshold * 0.75) - item.stock);
    candidates.push({
      itemName: item.name,
      currentStock: item.stock,
      predictedDemand,
      recommendedOrderQty,
      unit: item.unit || "units",
      reason: "Inventory is at or near the restock threshold."
    });
  });

  return candidates
    .sort((left, right) => right.recommendedOrderQty - left.recommendedOrderQty || left.currentStock - right.currentStock)
    .slice(0, 6)
    .map((entry) => ({
      itemName: entry.itemName,
      currentStock: entry.currentStock,
      predictedDemand: entry.predictedDemand,
      recommendedOrderQty: entry.recommendedOrderQty,
      reason: entry.reason
    }));
}

function buildNarrative(context, horizonDays, demandSeries, recommendations, confidence) {
  const predictedTotal = demandSeries.reduce((sum, entry) => sum + entry.predictedUnits, 0);
  const trendDirection = context.trendPct > 0.08 ? "up" : context.trendPct < -0.08 ? "down" : "flat";
  const trendText =
    trendDirection === "flat"
      ? "sales are broadly stable"
      : `sales are trending ${trendDirection} ${Math.abs(context.trendPct * 100).toFixed(1)}% versus the prior week`;
  const restockText =
    recommendations.length > 0
      ? `The strongest restock signal is ${recommendations[0].itemName}.`
      : "No urgent restock action is required from the current forecast.";

  return {
    summary: `Projected demand over the next ${horizonDays} days is about ${predictedTotal} units and ${trendText}. ${restockText}`,
    confidence,
    risks: [
      context.salesCount < 14 ? "Sales history is still short, so the forecast leans more on recent averages." : "",
      context.lowStockItems.length > 0
        ? `${context.lowStockItems.length} inventory item${context.lowStockItems.length === 1 ? "" : "s"} are close to restock thresholds.`
        : "",
      context.totalUnits === 0 ? "No sales history was available, so the forecast is conservative." : ""
    ].filter(Boolean),
    notes: [
      `Forecast window: ${horizonDays} days.`,
      `Analysis window: ${context.dailySeries.length} days of sales history.`,
      "This forecast uses recent sales and inventory levels."
    ]
  };
}

function normalizeForecastOutput(payload, context, source, model) {
  const horizonDays = HORIZON_OPTIONS.includes(Number(payload?.horizonDays))
    ? Number(payload.horizonDays)
    : context.horizonDays;
  const confidence = clamp(toNumber(payload?.confidence, 0), 0, 100);
  const demandSeries = Array.isArray(payload?.demandSeries)
    ? payload.demandSeries
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const date = normalizeLabel(entry.date);
          const parsedDate = safeDate(date);
          if (!parsedDate) return null;
          return {
            date: toIsoDate(parsedDate),
            predictedUnits: Math.max(0, Math.round(toNumber(entry.predictedUnits))),
            confidence: clamp(Math.round(toNumber(entry.confidence, confidence)), 0, 100)
          };
        })
        .filter(Boolean)
    : [];

  const recommendations = Array.isArray(payload?.recommendations)
    ? payload.recommendations
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          return {
            itemName: normalizeLabel(entry.itemName) || "Unspecified item",
            currentStock: Math.max(0, toNumber(entry.currentStock)),
            predictedDemand: Math.max(0, Math.round(toNumber(entry.predictedDemand))),
            recommendedOrderQty: Math.max(0, Math.round(toNumber(entry.recommendedOrderQty))),
            reason: normalizeLabel(entry.reason) || "Forecast-driven restock suggestion."
          };
        })
        .filter(Boolean)
    : [];

  const fallback = buildDemandSeries(context, horizonDays, 1 + clamp(context.trendPct * 0.5, -0.25, 0.25), confidence || 72);
  const normalizedSeries = demandSeries.length > 0 ? demandSeries : fallback;
  const normalizedRecommendations = recommendations.length > 0 ? recommendations : buildRecommendations(context, normalizedSeries);
  const narrative = buildNarrative(context, horizonDays, normalizedSeries, normalizedRecommendations, confidence || 72);

  return {
    source,
    model,
    horizonDays,
    generatedAt: context.generatedAt,
    summary: normalizeLabel(payload?.summary) || narrative.summary,
    confidence: confidence || narrative.confidence,
    demandSeries: normalizedSeries,
    recommendations: normalizedRecommendations,
    risks: Array.isArray(payload?.risks) && payload.risks.length > 0 ? payload.risks.map(normalizeLabel).filter(Boolean) : narrative.risks,
    notes: Array.isArray(payload?.notes) && payload.notes.length > 0 ? payload.notes.map(normalizeLabel).filter(Boolean) : narrative.notes,
    salesCount: context.salesCount,
    inventoryCount: context.inventoryCount
  };
}

function buildHeuristicPayload(context) {
  const confidence = clamp(
    Math.round(
      54 +
        Math.min(24, context.salesCount >= 30 ? 20 : context.salesCount >= 14 ? 14 : context.salesCount >= 7 ? 8 : 2) +
        clamp(Math.abs(context.trendPct) * 10, 0, 12)
    ),
    42,
    90
  );
  const multiplier = 1 + clamp(context.trendPct * 0.45, -0.2, 0.3);
  const demandSeries = buildDemandSeries(context, context.horizonDays, multiplier, confidence);
  const recommendations = buildRecommendations(context, demandSeries);
  const narrative = buildNarrative(context, context.horizonDays, demandSeries, recommendations, confidence);

  return {
    source: "heuristic",
    model: null,
    horizonDays: context.horizonDays,
    generatedAt: context.generatedAt,
    summary: narrative.summary,
    confidence: narrative.confidence,
    demandSeries,
    recommendations,
    risks: narrative.risks,
    notes: narrative.notes,
    salesCount: context.salesCount,
    inventoryCount: context.inventoryCount
  };
}

function buildOpenAiMessages(context) {
  const snapshot = {
    horizonDays: context.horizonDays,
    salesCount: context.salesCount,
    inventoryCount: context.inventoryCount,
    totalUnits: context.totalUnits,
    totalRevenue: Math.round(context.totalRevenue),
    recent7: context.recent7,
    prior7: context.prior7,
    trendPct: Number(context.trendPct.toFixed(4)),
    lowStockItems: context.lowStockItems,
    topItems: context.itemSales,
    dailySeries: context.dailySeries
  };

  return [
    {
      role: "system",
      content:
        "You are a demand planning assistant for a small restaurant inventory dashboard. Use the provided sales and inventory snapshot to produce a conservative forecast. Do not invent items. Return only valid JSON that matches the schema."
    },
    {
      role: "user",
      content: JSON.stringify(snapshot)
    }
  ];
}

function buildResponseFormat() {
  return {
    type: "json_schema",
    json_schema: {
      name: "forecast_response",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          confidence: { type: "number" },
          demandSeries: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                date: { type: "string" },
                predictedUnits: { type: "number" },
                confidence: { type: "number" }
              },
              required: ["date", "predictedUnits", "confidence"]
            }
          },
          recommendations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                itemName: { type: "string" },
                currentStock: { type: "number" },
                predictedDemand: { type: "number" },
                recommendedOrderQty: { type: "number" },
                reason: { type: "string" }
              },
              required: ["itemName", "currentStock", "predictedDemand", "recommendedOrderQty", "reason"]
            }
          },
          risks: {
            type: "array",
            items: { type: "string" }
          },
          notes: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["summary", "confidence", "demandSeries", "recommendations", "risks", "notes"]
      }
    }
  };
}

export async function generateForecast({ salesHistory, inventory, horizonDays, apiKey, model = DEFAULT_MODEL }) {
  const context = buildForecastContext({ salesHistory, inventory, horizonDays });

  if (!apiKey) {
    return buildHeuristicPayload(context);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: buildOpenAiMessages(context),
        response_format: buildResponseFormat(),
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI returned an empty completion.");
    }

    const parsed = JSON.parse(content);
    return normalizeForecastOutput(parsed, context, "openai", data?.model || model);
  } catch (error) {
    const fallback = buildHeuristicPayload(context);
    return {
      ...fallback,
      notes: [...fallback.notes, `OpenAI fallback triggered: ${error?.message || "Unknown error"}`]
    };
  }
}

export { DEFAULT_MODEL as FORECAST_DEFAULT_MODEL, HORIZON_OPTIONS as FORECAST_HORIZON_OPTIONS };
