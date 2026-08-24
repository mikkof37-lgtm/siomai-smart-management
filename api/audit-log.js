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
const AUDIT_TABLE = globalThis.process?.env?.SUPABASE_AUDIT_TABLE?.trim() || "audit_logs";

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

function normalizeAuditEntry(entry) {
  if (!isPlainObject(entry)) return null;

  const id = normalizeText(entry.id) || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const entityType = normalizeText(entry.entityType) || "unknown";
  const entityId = normalizeText(entry.entityId) || "unknown";
  const action = normalizeText(entry.action) || "updated";

  return {
    id,
    entity_type: entityType,
    entity_id: entityId,
    action,
    performed_by: normalizeText(entry.performedBy) || null,
    performed_by_email: normalizeText(entry.performedByEmail) || null,
    performed_at: normalizeText(entry.performedAt) || new Date().toISOString(),
    reason: normalizeText(entry.reason) || null,
    branch: normalizeText(entry.branch) || null,
    source: normalizeText(entry.source) || "browser",
    before_data: entry.beforeData ?? null,
    after_data: entry.afterData ?? null,
    request_id: normalizeText(entry.requestId) || null,
    metadata: isPlainObject(entry.metadata) ? entry.metadata : {}
  };
}

function parsePositiveInteger(value, fallback, max) {
  const parsed = Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (Number.isFinite(max)) return Math.min(parsed, max);
  return parsed;
}

function normalizeQueryValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFilterValue(value) {
  const normalized = normalizeQueryValue(value);
  return normalized ? normalized.toLowerCase() : "";
}

function rowText(row, keys) {
  return keys
    .map((key) => normalizeQueryValue(row?.[key]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function rowMatchesFilters(row, filters) {
  const entityType = normalizeFilterValue(filters.entityType);
  const action = normalizeFilterValue(filters.action);
  const branch = normalizeFilterValue(filters.branch);
  const actor = normalizeFilterValue(filters.actor);
  const search = normalizeFilterValue(filters.search);
  const from = normalizeQueryValue(filters.from);
  const to = normalizeQueryValue(filters.to);

  if (entityType && normalizeText(row.entityType).toLowerCase() !== entityType) return false;
  if (action && normalizeText(row.action).toLowerCase() !== action) return false;
  if (branch && normalizeText(row.branch).toLowerCase() !== branch) return false;

  const actorText = rowText(row, ["performedBy", "performedByEmail"]);
  if (actor && !actorText.includes(actor)) return false;

  const searchText = rowText(row, [
    "entityType",
    "entityId",
    "action",
    "performedBy",
    "performedByEmail",
    "reason",
    "branch",
    "source"
  ]);
  const summaryText = rowText(row.metadata || {}, ["summary", "details"]);
  if (search && !`${searchText} ${summaryText}`.includes(search)) return false;

  const performedAt = normalizeQueryValue(row.performedAt);
  if (from && performedAt && performedAt < from) return false;
  if (to && performedAt && performedAt > to) return false;

  return true;
}

function sortAuditRows(rows) {
  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(left.performedAt || "") || 0;
    const rightTime = Date.parse(right.performedAt || "") || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return String(right.id || "").localeCompare(String(left.id || ""));
  });
}

function paginateRows(rows, page, perPage) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const fromIndex = (safePage - 1) * perPage;
  const slice = rows.slice(fromIndex, fromIndex + perPage);

  return {
    rows: slice,
    total,
    totalPages,
    page: safePage
  };
}

async function requireAuthenticatedUser(req, { adminOnly = false, requireServiceRole = true } = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || (requireServiceRole && !SUPABASE_SERVICE_ROLE_KEY)) {
    return { error: { status: 503, message: "Supabase audit credentials are not configured." } };
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

function createUserScopedClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

function serializeAuditRow(row) {
  if (!row || typeof row !== "object") return null;

  return {
    id: row.id ?? "",
    entityType: normalizeText(row.entity_type),
    entityId: normalizeText(row.entity_id),
    action: normalizeText(row.action),
    performedBy: normalizeText(row.performed_by),
    performedByEmail: normalizeText(row.performed_by_email),
    performedAt: normalizeText(row.performed_at),
    reason: normalizeText(row.reason),
    branch: normalizeText(row.branch),
    source: normalizeText(row.source) || "browser",
    beforeData: row.before_data ?? null,
    afterData: row.after_data ?? null,
    requestId: normalizeText(row.request_id),
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {}
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    if (req.method === "GET") {
      const token = getBearerToken(req);
      const auth = await requireAuthenticatedUser(req, { adminOnly: true, requireServiceRole: false });
      if (auth.error) {
        res.status(auth.error.status).json({ error: auth.error.message });
        return;
      }

      const requestUrl = new URL(req.url, "http://localhost");
      const page = parsePositiveInteger(requestUrl.searchParams.get("page"), 1, 1000);
      const perPage = parsePositiveInteger(requestUrl.searchParams.get("perPage"), 50, 100);
      const filters = {
        entityType: requestUrl.searchParams.get("entityType"),
        action: requestUrl.searchParams.get("action"),
        branch: requestUrl.searchParams.get("branch"),
        actor: requestUrl.searchParams.get("actor"),
        search: requestUrl.searchParams.get("search"),
        from: requestUrl.searchParams.get("from"),
        to: requestUrl.searchParams.get("to")
      };

      const readClient = auth.serviceClient || createUserScopedClient(token);
      const { data, error } = await readClient.from(AUDIT_TABLE).select("*");

      if (error) {
        res.status(200).json({
          logs: [],
          page,
          perPage,
          total: 0,
          totalPages: 1,
          notice: "Audit log storage is not ready yet.",
          detail: error.message || "Unknown error"
        });
        return;
      }

      const logs = sortAuditRows(
        (Array.isArray(data) ? data : []).map(serializeAuditRow).filter(Boolean)
      ).filter((row) => rowMatchesFilters(row, filters));
      const pagination = paginateRows(logs, page, perPage);

      res.status(200).json({
        logs: pagination.rows,
        page: pagination.page,
        perPage,
        total: pagination.total,
        totalPages: pagination.totalPages
      });
      return;
    }

    const auth = await requireAuthenticatedUser(req);
    if (auth.error) {
      res.status(auth.error.status).json({ error: auth.error.message });
      return;
    }

    const body = await readJsonBody(req);
    const entries = Array.isArray(body.entries) ? body.entries : Array.isArray(body.entry) ? [body.entry] : [];
    const normalizedEntries = entries.map(normalizeAuditEntry).filter(Boolean);

    if (normalizedEntries.length === 0) {
      res.status(400).json({
        error: "No audit entries provided.",
        detail: "The request must include one or more audit log entries."
      });
      return;
    }

    const actor = auth.user;
    const actorEmail = actor.email || "";
    const actorRole = getUserRole(actor) || "staff";
    const actorBranch = getUserDefaultBranch(actor);

    const rows = normalizedEntries.map((entry) => ({
      ...entry,
      performed_by: actor.id,
      performed_by_email: actorEmail,
      metadata: {
        ...(isPlainObject(entry.metadata) ? entry.metadata : {}),
        actorRole,
        actorBranch
      }
    }));

    const { data, error } = await auth.serviceClient
      .from(AUDIT_TABLE)
      .upsert(rows, { onConflict: "id" })
      .select("id");

    if (error) {
      res.status(500).json({
        error: "Audit log write failed.",
        detail: error.message || "Unknown error"
      });
      return;
    }

    res.status(200).json({
      inserted: Array.isArray(data) ? data.length : rows.length,
      user: {
        id: actor.id,
        email: actorEmail,
        role: actorRole,
        branch: actorBranch
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Audit log request failed.",
      detail: error?.message || "Unknown error"
    });
  }
}
