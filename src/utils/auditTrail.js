const AUDIT_QUEUE_KEY = "smart_inventory_audit_queue";
const AUDIT_QUEUE_LIMIT = 500;
const AUDIT_ENDPOINT = "/api/audit-log";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cloneValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function createId(prefix = "audit") {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createAuditLog(entry = {}) {
  const entityType = normalizeText(entry.entityType) || "unknown";
  const entityId = normalizeText(entry.entityId) || "unknown";
  const action = normalizeText(entry.action) || "updated";

  return {
    id: normalizeText(entry.id) || createId("audit"),
    entityType,
    entityId,
    action,
    performedAt: normalizeText(entry.performedAt) || new Date().toISOString(),
    performedBy: normalizeText(entry.performedBy) || "",
    performedByEmail: normalizeText(entry.performedByEmail) || "",
    reason: normalizeText(entry.reason) || "",
    branch: normalizeText(entry.branch) || "",
    source: normalizeText(entry.source) || "browser",
    beforeData: cloneValue(entry.beforeData),
    afterData: cloneValue(entry.afterData),
    requestId: normalizeText(entry.requestId) || "",
    metadata: cloneValue(entry.metadata) || {}
  };
}

function readStoredAuditQueue() {
  if (typeof localStorage === "undefined") return [];

  const stored = localStorage.getItem(AUDIT_QUEUE_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map(createAuditLog).slice(0, AUDIT_QUEUE_LIMIT) : [];
  } catch {
    return [];
  }
}

export function getQueuedAuditLogs() {
  return readStoredAuditQueue();
}

function writeStoredAuditQueue(entries) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AUDIT_QUEUE_KEY, JSON.stringify(entries.slice(0, AUDIT_QUEUE_LIMIT)));
}

export function queueAuditLogs(entries = []) {
  const normalized = Array.isArray(entries)
    ? entries.map(createAuditLog).filter(Boolean)
    : [];

  if (normalized.length === 0) return [];

  const current = readStoredAuditQueue();
  const byId = new Map(current.map((entry) => [entry.id, entry]));

  normalized.forEach((entry) => {
    byId.set(entry.id, entry);
  });

  const nextQueue = [...byId.values()].slice(-AUDIT_QUEUE_LIMIT);
  writeStoredAuditQueue(nextQueue);
  return nextQueue;
}

export async function flushQueuedAuditLogs({
  getAccessToken,
  endpoint = AUDIT_ENDPOINT
} = {}) {
  const queued = readStoredAuditQueue();
  if (queued.length === 0) return { flushed: 0, queued: 0 };

  if (typeof getAccessToken !== "function") {
    return { flushed: 0, queued: queued.length };
  }

  const accessToken = await getAccessToken().catch(() => "");
  if (!accessToken) {
    return { flushed: 0, queued: queued.length };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ entries: queued })
  });

  if (!response.ok) {
    return { flushed: 0, queued: queued.length };
  }

  writeStoredAuditQueue([]);
  return { flushed: queued.length, queued: 0 };
}

function buildInventorySnapshot(item) {
  if (!item) return null;

  return {
    id: item.id,
    code: item.code,
    name: item.name,
    category: item.category,
    unit: item.unit,
    stock: Number(item.stock ?? 0),
    threshold: Number(item.threshold ?? 0),
    price: Number(item.price ?? 0),
    minStock: item.minStock ?? null,
    maxStock: item.maxStock ?? null,
    updatedAt: item.updatedAt || item.updatedat || ""
  };
}

function buildSaleSnapshot(sale) {
  if (!sale) return null;

  return {
    id: sale.id,
    date: sale.date,
    product: sale.product,
    qty: Number(sale.qty ?? 0),
    price: Number(sale.price ?? 0),
    notes: sale.notes || "",
    branch: sale.branch || "",
    inventoryItemId: sale.inventoryItemId ?? null,
    inventoryItemName: sale.inventoryItemName || "",
    inventoryQty: sale.inventoryQty ?? null,
    createdAt: sale.createdAt || ""
  };
}

function buildInventoryDetail(previousItem, nextItem, action) {
  const prevName = previousItem?.name || nextItem?.name || "Inventory item";

  if (action === "created") {
    return {
      summary: `Added ${prevName}.`,
      details: `Started with ${Number(nextItem?.stock ?? 0)} stock at PHP ${Number(nextItem?.price ?? 0).toFixed(2)}.`
    };
  }

  if (action === "deleted") {
    return {
      summary: `Deleted ${prevName}.`,
      details: `Removed from inventory after being tracked at ${Number(previousItem?.stock ?? 0)} stock.`
    };
  }

  const changes = [];
  if (previousItem && nextItem) {
    if (previousItem.name !== nextItem.name) {
      changes.push(`name: ${previousItem.name || "unset"} -> ${nextItem.name || "unset"}`);
    }
    if (previousItem.code !== nextItem.code) {
      changes.push(`code: ${previousItem.code || "unset"} -> ${nextItem.code || "unset"}`);
    }
    if (previousItem.category !== nextItem.category) {
      changes.push(`category: ${previousItem.category || "unset"} -> ${nextItem.category || "unset"}`);
    }
    if (previousItem.unit !== nextItem.unit) {
      changes.push(`unit: ${previousItem.unit || "unset"} -> ${nextItem.unit || "unset"}`);
    }
    if (previousItem.threshold !== nextItem.threshold) {
      changes.push(`threshold: ${previousItem.threshold ?? "unset"} -> ${nextItem.threshold ?? "unset"}`);
    }
    if (previousItem.price !== nextItem.price) {
      changes.push(`price: ${previousItem.price ?? "unset"} -> ${nextItem.price ?? "unset"}`);
    }
    if (previousItem.minStock !== nextItem.minStock) {
      changes.push(`minimum stock: ${previousItem.minStock ?? "unset"} -> ${nextItem.minStock ?? "unset"}`);
    }
    if (previousItem.maxStock !== nextItem.maxStock) {
      changes.push(`maximum stock: ${previousItem.maxStock ?? "unset"} -> ${nextItem.maxStock ?? "unset"}`);
    }

    const stockDelta = Number(nextItem.stock ?? 0) - Number(previousItem.stock ?? 0);
    if (stockDelta !== 0) {
      const direction = stockDelta > 0 ? "increased" : "decreased";
      changes.push(`stock ${direction} by ${Math.abs(stockDelta)} (${previousItem.stock ?? 0} -> ${nextItem.stock ?? 0})`);
    }
  }

  return {
    summary: `Updated ${prevName}.`,
    details: changes.join("; ") || `Updated ${prevName}.`
  };
}

export function buildInventoryAuditLogs(previousItems, nextItems, { source = "browser" } = {}) {
  const previousById = new Map((Array.isArray(previousItems) ? previousItems : []).map((item) => [String(item.id), item]));
  const nextById = new Map((Array.isArray(nextItems) ? nextItems : []).map((item) => [String(item.id), item]));
  const logs = [];

  for (const item of nextById.values()) {
    if (!previousById.has(String(item.id))) {
      const details = buildInventoryDetail(null, item, "created");
      logs.push(
        createAuditLog({
          entityType: "inventory_item",
          entityId: String(item.id),
          action: "created",
          source,
          beforeData: null,
          afterData: buildInventorySnapshot(item),
          metadata: {
            summary: details.summary,
            details: details.details
          }
        })
      );
    }
  }

  for (const item of previousById.values()) {
    if (!nextById.has(String(item.id))) {
      const details = buildInventoryDetail(item, null, "deleted");
      logs.push(
        createAuditLog({
          entityType: "inventory_item",
          entityId: String(item.id),
          action: "deleted",
          source,
          beforeData: buildInventorySnapshot(item),
          afterData: null,
          metadata: {
            summary: details.summary,
            details: details.details
          }
        })
      );
    }
  }

  for (const nextItem of nextById.values()) {
    const previousItem = previousById.get(String(nextItem.id));
    if (!previousItem) continue;

    const snapshotChanged = JSON.stringify(buildInventorySnapshot(previousItem)) !== JSON.stringify(buildInventorySnapshot(nextItem));
    if (!snapshotChanged) continue;

    const details = buildInventoryDetail(previousItem, nextItem, "updated");
    logs.push(
      createAuditLog({
        entityType: "inventory_item",
        entityId: String(nextItem.id),
        action:
          Number(nextItem.stock ?? 0) !== Number(previousItem.stock ?? 0) &&
          details.details.split("; ").length === 1
            ? "stock_adjusted"
            : "updated",
        source,
        beforeData: buildInventorySnapshot(previousItem),
        afterData: buildInventorySnapshot(nextItem),
        metadata: {
          summary: details.summary,
          details: details.details
        }
      })
    );
  }

  return logs;
}

export function buildSaleAuditLog({
  action,
  beforeSale = null,
  afterSale = null,
  branch = "",
  reason = "",
  source = "browser",
  metadata = {}
} = {}) {
  const targetSale = afterSale || beforeSale;
  if (!targetSale && action !== "cleared") return null;

  const entityId = action === "cleared" ? "all" : String(targetSale.id);

  return createAuditLog({
    entityType: action === "cleared" ? "sale_batch" : "sale",
    entityId,
    action,
    branch,
    reason,
    source,
    beforeData:
      action === "cleared"
        ? {
            count: Array.isArray(beforeSale) ? beforeSale.length : 0,
            ids: Array.isArray(beforeSale) ? beforeSale.map((sale) => sale.id) : []
          }
        : buildSaleSnapshot(beforeSale),
    afterData:
      action === "cleared"
        ? {
            count: 0,
            ids: []
          }
        : buildSaleSnapshot(afterSale),
    metadata
  });
}

export function buildSaleBatchAuditLogs(sales, { source = "browser" } = {}) {
  if (!Array.isArray(sales)) return [];

  return sales
    .filter(Boolean)
    .map((sale) =>
      buildSaleAuditLog({
        action: "created",
        afterSale: sale,
        branch: sale.branch || "",
        source,
        metadata: {
          summary: `Recorded ${sale.product || "sale"}.`,
          details: `Added ${Number(sale.qty ?? 0)} units at PHP ${Number(sale.price ?? 0).toFixed(2)}.`
        }
      })
    )
    .filter(Boolean);
}
