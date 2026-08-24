import { createClient } from "@supabase/supabase-js";
import { getUserDefaultBranch, getUserRole, isAdminOrOwner } from "../src/utils/authRoles.js";

const SUPABASE_URL =
  globalThis.process?.env?.SUPABASE_URL?.trim() ||
  globalThis.process?.env?.VITE_SUPABASE_URL?.trim() ||
  "";
const SUPABASE_ANON_KEY =
  globalThis.process?.env?.SUPABASE_ANON_KEY?.trim() ||
  globalThis.process?.env?.VITE_SUPABASE_ANON_KEY?.trim() ||
  "";
const SUPABASE_SERVICE_ROLE_KEY =
  globalThis.process?.env?.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
const SALES_TABLE = globalThis.process?.env?.SUPABASE_SALES_TABLE?.trim() || "sales_records";
const SALE_BRANCH_PREFIX = "__smart_inventory_branch__:";

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body || "{}"));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (typeof header !== "string") return "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function encodeSaleNotes(branch, notes) {
  const cleanBranch = typeof branch === "string" ? branch.trim() : "";
  const cleanNotes = typeof notes === "string" ? notes.trim() : "";

  if (!cleanBranch) return cleanNotes;

  const prefix = `${SALE_BRANCH_PREFIX}${encodeURIComponent(cleanBranch)}`;
  return cleanNotes ? `${prefix}\n${cleanNotes}` : prefix;
}

function normalizeSaleRow(sale) {
  if (!isPlainObject(sale)) return null;

  const id = normalizeText(sale.id) || `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    date: normalizeText(sale.date) || new Date().toISOString().slice(0, 10),
    product: normalizeText(sale.product) || "Unknown item",
    qty: Number(sale.qty ?? 0),
    price: Number(sale.price ?? 0),
    notes: encodeSaleNotes(sale.branch, sale.notes),
    inventory_item_id:
      sale.inventoryItemId === undefined || sale.inventoryItemId === null
        ? null
        : Number(sale.inventoryItemId),
    inventory_item_name: normalizeText(sale.inventoryItemName) || null,
    inventory_qty:
      sale.inventoryQty === undefined || sale.inventoryQty === null
        ? null
        : Number(sale.inventoryQty),
    created_at: normalizeText(sale.createdAt) || new Date().toISOString()
  };
}

async function requireAuthenticatedUser(req, { adminOnly = false } = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { error: { status: 503, message: "Supabase sales sync credentials are not configured." } };
  }

  const token = getBearerToken(req);
  if (!token) {
    return { error: { status: 401, message: "Authorization token required." } };
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    return { error: { status: 401, message: "Invalid or expired session." } };
  }

  if (adminOnly && !isAdminOrOwner(data.user)) {
    return { error: { status: 403, message: "Admin access required." } };
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return { user: data.user, serviceClient };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.error) {
      res.status(auth.error.status).json({ error: auth.error.message });
      return;
    }

    const body = await readJsonBody(req);
    const previousItems = Array.isArray(body.previousItems) ? body.previousItems : [];
    const nextItems = Array.isArray(body.nextItems) ? body.nextItems : [];

    const previousRows = previousItems.map(normalizeSaleRow).filter(Boolean);
    const nextRows = nextItems.map(normalizeSaleRow).filter(Boolean);

    const previousIds = new Set(previousRows.map((row) => String(row.id)));
    const nextIds = new Set(nextRows.map((row) => String(row.id)));
    const removedIds = [...previousIds].filter((id) => !nextIds.has(id));

    if (removedIds.length > 0) {
      const { error: deleteError } = await auth.serviceClient.from(SALES_TABLE).delete().in("id", removedIds);
      if (deleteError) {
        res.status(500).json({
          error: "Sales delete failed.",
          detail: deleteError.message || "Unknown error"
        });
        return;
      }
    }

    if (nextRows.length > 0) {
      const { error: upsertError } = await auth.serviceClient
        .from(SALES_TABLE)
        .upsert(nextRows, { onConflict: "id" });

      if (upsertError) {
        res.status(500).json({
          error: "Sales upsert failed.",
          detail: upsertError.message || "Unknown error"
        });
        return;
      }
    }

    res.status(200).json({
      deleted: removedIds.length,
      upserted: nextRows.length,
      user: {
        id: auth.user.id,
        email: auth.user.email || "",
        role: getUserRole(auth.user) || "staff",
        branch: getUserDefaultBranch(auth.user)
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Sales sync request failed.",
      detail: error?.message || "Unknown error"
    });
  }
}
