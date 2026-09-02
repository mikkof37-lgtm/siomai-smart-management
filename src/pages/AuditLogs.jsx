import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { BRANCH_OPTIONS } from "../data/branches";
import { supabase } from "../lib/supabaseClient";
import { isAdminOrOwner } from "../utils/authRoles";
import { getQueuedAuditLogs } from "../utils/auditTrail";

const ENTITY_OPTIONS = [
  { value: "all", label: "All entities" },
  { value: "sale", label: "Sales" },
  { value: "inventory_item", label: "Inventory" },
  { value: "user", label: "User/Admin" }
];

const ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "deleted", label: "Deleted" },
  { value: "stock_adjusted", label: "Stock adjusted" },
  { value: "voided", label: "Voided" },
  { value: "corrected", label: "Corrected" },
  { value: "undone", label: "Undone" },
  { value: "cleared", label: "Cleared" }
];

const DESTRUCTIVE_ACTIONS = new Set(["deleted", "voided", "cleared"]);
const PAGE_SIZE = 20;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAuditLog(row) {
  if (!row || typeof row !== "object") return null;

  return {
    id: normalizeText(row.id),
    entityType: normalizeText(row.entityType || row.entity_type) || "unknown",
    entityId: normalizeText(row.entityId || row.entity_id) || "unknown",
    action: normalizeText(row.action) || "updated",
    performedBy: normalizeText(row.performedBy || row.performed_by),
    performedByEmail: normalizeText(row.performedByEmail || row.performed_by_email),
    performedAt: normalizeText(row.performedAt || row.performed_at),
    reason: normalizeText(row.reason),
    branch: normalizeText(row.branch),
    source: normalizeText(row.source) || "browser",
    beforeData: row.beforeData ?? row.before_data ?? null,
    afterData: row.afterData ?? row.after_data ?? null,
    requestId: normalizeText(row.requestId || row.request_id),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : {}
  };
}

function formatTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "";

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getDateKey(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "";
  return parsed.toISOString().slice(0, 10);
}

function dateInputToStartIso(value) {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function dateInputToEndIso(value) {
  if (!value) return "";
  const parsed = new Date(`${value}T23:59:59.999`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function getEntityLabel(entityType) {
  if (entityType === "sale") return "Sales";
  if (entityType === "inventory_item") return "Inventory";
  if (entityType === "user") return "User/Admin";
  return entityType || "Unknown";
}

function getActionLabel(action) {
  if (action === "stock_adjusted") return "Stock adjusted";
  if (action === "undone") return "Undone";
  if (action === "voided") return "Voided";
  if (action === "corrected") return "Corrected";
  if (action === "cleared") return "Cleared";
  return action ? action.replaceAll("_", " ") : "Updated";
}

function getToneClasses(action) {
  if (DESTRUCTIVE_ACTIONS.has(action)) {
    return {
      badge: "bg-[#ffeceb] text-[#c8453a] border-[#ffd0cb]",
      accent: "bg-[#ff6b5c]"
    };
  }

  if (action === "created") {
    return {
      badge: "bg-[#e8f7ee] text-[#1e9e61] border-[#d5f1e0]",
      accent: "bg-[#22a06b]"
    };
  }

  if (action === "stock_adjusted") {
    return {
      badge: "bg-[#fff3d8] text-[#c27a1a] border-[#f8dfaa]",
      accent: "bg-[#f4a71d]"
    };
  }

  return {
    badge: "bg-[#e9f2ff] text-[#2f6fed] border-[#d7e4ff]",
    accent: "bg-[#2f6fed]"
  };
}

function stringifyCsvValue(value) {
  if (value === null || value === undefined) return "";
  const raw =
    typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value);
  return `"${String(raw).replaceAll('"', '""')}"`;
}

function buildCsv(rows) {
  const header = [
    "timestamp",
    "entity_type",
    "entity_id",
    "action",
    "branch",
    "performed_by",
    "performed_by_email",
    "source",
    "reason",
    "summary",
    "details",
    "before_data",
    "after_data"
  ];

  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        stringifyCsvValue(row.performedAt),
        stringifyCsvValue(row.entityType),
        stringifyCsvValue(row.entityId),
        stringifyCsvValue(row.action),
        stringifyCsvValue(row.branch),
        stringifyCsvValue(row.performedBy),
        stringifyCsvValue(row.performedByEmail),
        stringifyCsvValue(row.source),
        stringifyCsvValue(row.reason),
        stringifyCsvValue(row.metadata?.summary || ""),
        stringifyCsvValue(row.metadata?.details || ""),
        stringifyCsvValue(row.beforeData),
        stringifyCsvValue(row.afterData)
      ].join(",")
    )
  ];

  return lines.join("\r\n");
}

function downloadCsv(rows) {
  const blob = new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function branchLabel(value) {
  const branch = BRANCH_OPTIONS.find((option) => option.value === value);
  return branch?.label || value || "Unassigned";
}

function summarizePayload(value) {
  if (value === null || value === undefined) return "None";

  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildFilters({
  searchQuery,
  entityType,
  action,
  branch,
  actor,
  fromDate,
  toDate
}) {
  const params = new URLSearchParams();

  if (searchQuery.trim()) params.set("search", searchQuery.trim());
  if (entityType && entityType !== "all") params.set("entityType", entityType);
  if (action && action !== "all") params.set("action", action);
  if (branch) params.set("branch", branch);
  if (actor.trim()) params.set("actor", actor.trim());
  if (fromDate) params.set("from", dateInputToStartIso(fromDate));
  if (toDate) params.set("to", dateInputToEndIso(toDate));

  return params;
}

async function fetchAuditPage(filters, page, perPage) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error("Unable to read the current session.");
  }

  const params = buildFilters(filters);
  params.set("page", String(page));
  params.set("perPage", String(perPage));

  const response = await fetch(`/api/audit-log?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const responseText = await response.text();
  let data = null;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(
      responseText.includes("import ")
        ? "The local audit API route is not being served in this environment."
        : responseText.slice(0, 180) || "Failed to load audit logs."
    );
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.detail || "Failed to load audit logs.");
  }

  return {
    logs: Array.isArray(data.logs) ? data.logs.map(normalizeAuditLog).filter(Boolean) : [],
    total: Number(data.total || 0),
    totalPages: Number(data.totalPages || 1),
    page: Number(data.page || page),
    notice: typeof data.notice === "string" ? data.notice : "",
    detail: typeof data.detail === "string" ? data.detail : ""
  };
}

export default function AuditLogs({ onLogout, currentUser }) {
  const canView = isAdminOrOwner(currentUser);
  const [searchQuery, setSearchQuery] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const [branch, setBranch] = useState("");
  const [actor, setActor] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState("");

  const filters = useMemo(
    () => ({
      searchQuery,
      entityType,
      action,
      branch,
      actor,
      fromDate,
      toDate
    }),
    [action, actor, branch, entityType, fromDate, searchQuery, toDate]
  );

  const loadLogs = useCallback(
    async (pageValue = 1, perPage = PAGE_SIZE) => {
      if (!canView) return;

      setLoading(true);
      setNotice("");

      try {
        const result = await fetchAuditPage(filters, pageValue, perPage);
        const queuedLogs = getQueuedAuditLogs();
        const mergedLogs = [...result.logs];
        if (queuedLogs.length > 0) {
          const byId = new Map(mergedLogs.map((log) => [log.id, log]));
          queuedLogs.forEach((log) => {
            byId.set(log.id, log);
          });

          mergedLogs.splice(
            0,
            mergedLogs.length,
            ...[...byId.values()].sort(
              (left, right) => Date.parse(right.performedAt || "") - Date.parse(left.performedAt || "")
            )
          );
        }

        setLogs(mergedLogs);
        setTotal(Math.max(result.total, mergedLogs.length));
        setTotalPages(Math.max(1, result.totalPages));
        setPage(result.page);
        setLastRefreshedAt(new Date().toISOString());
        if (result.notice || queuedLogs.length > 0) {
          const queueNotice =
            queuedLogs.length > 0 ? "Showing locally queued audit logs until sync completes." : "";
          const backendNotice = result.notice
            ? result.detail
              ? `${result.notice} ${result.detail}`
              : result.notice
            : "";
          setNotice([backendNotice, queueNotice].filter(Boolean).join(" ").trim());
        }
      } catch {
        const queuedLogs = getQueuedAuditLogs();
        setLogs(queuedLogs);
        setTotal(queuedLogs.length);
        setTotalPages(Math.max(1, Math.ceil(queuedLogs.length / perPage)));
        setPage(Math.min(pageValue, Math.max(1, Math.ceil(queuedLogs.length / perPage))));
        setLastRefreshedAt(new Date().toISOString());
        setNotice(
          queuedLogs.length > 0
            ? "Showing locally cached audit logs until the backend is available."
            : "No cached audit logs are available yet."
        );
      } finally {
        setLoading(false);
      }
    },
    [canView, filters]
  );

  const filterSignature = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    if (!canView) return undefined;

    const timer = setTimeout(() => {
      setPage(1);
      void loadLogs(1);
    }, 250);

    return () => clearTimeout(timer);
  }, [canView, filterSignature, loadLogs]);

  const timelineGroups = useMemo(() => {
    const groups = [];
    let currentKey = "";

    logs.forEach((log) => {
      const nextKey = getDateKey(log.performedAt);
      if (nextKey !== currentKey) {
        currentKey = nextKey;
        groups.push({ type: "date", key: currentKey, label: formatTimestamp(log.performedAt).split(",")[0] });
      }
      groups.push({ type: "log", key: log.id, log });
    });

    return groups;
  }, [logs]);

  const destructiveCount = useMemo(
    () => logs.filter((log) => DESTRUCTIVE_ACTIONS.has(log.action)).length,
    [logs]
  );
  const salesCount = useMemo(() => logs.filter((log) => log.entityType === "sale").length, [logs]);
  const inventoryCount = useMemo(
    () => logs.filter((log) => log.entityType === "inventory_item").length,
    [logs]
  );
  const userCount = useMemo(() => logs.filter((log) => log.entityType === "user").length, [logs]);

  const handleExportCsv = async () => {
    if (!canView) return;

    setExporting(true);
    setNotice("");

    try {
      const allRows = [];
      let currentPage = 1;
      let totalPageCount = 1;

      do {
        const result = await fetchAuditPage(filters, currentPage, 100);
        allRows.push(...result.logs);
        totalPageCount = result.totalPages;
        currentPage += 1;
      } while (currentPage <= totalPageCount);

      downloadCsv(allRows);
    } catch {
      const queuedLogs = getQueuedAuditLogs();
      if (queuedLogs.length > 0) {
        downloadCsv(queuedLogs);
        setNotice(
          "Export used local cached audit logs because the backend was unavailable."
        );
        return;
      }

      setNotice("CSV export could not be completed right now.");
    } finally {
      setExporting(false);
    }
  };

  if (!canView) return null;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--app-bg)] md:flex-row">
      <Sidebar currentUser={currentUser} />
      <div className="flex-1">
        <TopBar
          title="Audit Logs"
          subtitle="A unified timeline for sales, inventory, and admin actions."
          onLogout={onLogout}
          currentUser={currentUser}
        />

        <div className="px-4 pb-24 pt-4 sm:px-6 sm:pb-24 sm:pt-6 lg:px-8">
          <div className="mb-8 overflow-hidden rounded-[28px] border border-[var(--surface-border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(255,249,243,0.95)_56%,rgba(255,240,224,0.9)_100%)] shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-5 px-7 py-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b85d11]">
                  Unified timeline
                </div>
                <h1 className="text-3xl font-semibold text-[var(--app-text)] sm:text-4xl">
                  Watch sales, stock changes, and admin edits in one stream.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--surface-muted)]">
                  Use this page to verify changes, spot destructive actions quickly, and export a
                  clean CSV for bookkeeping.
                </p>
                {lastRefreshedAt && (
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--surface-muted)]">
                    Last refreshed {formatTimestamp(lastRefreshedAt)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void loadLogs(page)}
                  className="rounded-full border border-[#efe6dc] bg-white px-4 py-2 text-sm font-semibold text-[#6f5f52] transition hover:border-[#ffb47b] hover:text-[#c96f15]"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportCsv()}
                  disabled={exporting}
                  className="rounded-full bg-[#ff7a1a] px-5 py-2 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {exporting ? "Exporting..." : "Export CSV"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-[24px] border border-[#efe6dc] bg-white p-6 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <p className="text-sm text-[#8c7b6d]">Matching logs</p>
              <p className="mt-2 text-2xl font-semibold text-[#2b2018]">{total.toLocaleString()}</p>
            </div>
            <div className="rounded-[24px] border border-[#efe6dc] bg-white p-6 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <p className="text-sm text-[#8c7b6d]">Sales</p>
              <p className="mt-2 text-2xl font-semibold text-[#2b2018]">{salesCount}</p>
            </div>
            <div className="rounded-[24px] border border-[#efe6dc] bg-white p-6 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <p className="text-sm text-[#8c7b6d]">Inventory</p>
              <p className="mt-2 text-2xl font-semibold text-[#2b2018]">{inventoryCount}</p>
            </div>
            <div className="rounded-[24px] border border-[#efe6dc] bg-white p-6 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <p className="text-sm text-[#8c7b6d]">Destructive</p>
              <p className="mt-2 text-2xl font-semibold text-[#c8453a]">{destructiveCount}</p>
            </div>
            <div className="rounded-[24px] border border-[#efe6dc] bg-white p-6 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <p className="text-sm text-[#8c7b6d]">User/Admin</p>
              <p className="mt-2 text-2xl font-semibold text-[#2b2018]">{userCount}</p>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-[var(--surface-border)] bg-white/96 shadow-[var(--shadow-soft)]">
            {notice && (
              <div className="border-b border-[#f1dfc8] bg-[#fff8ef] px-7 py-5 text-sm text-[#8a5c1b]">
                {notice}
              </div>
            )}
            <div className="border-b border-[rgba(97,72,56,0.08)] px-7 py-5">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
                <div className="flex items-center gap-3 rounded-[20px] border border-[#efe6dc] bg-white px-4 py-3 shadow-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
                    <path
                      d="M21 21L16.65 16.65M18 11a7 7 0 11-14 0 7 7 0 0114 0z"
                      stroke="#b29c8b"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search entity, action, actor, branch, or reason..."
                    className="w-full bg-transparent text-sm text-[#7f6d60] outline-none placeholder:text-[#b8a999]"
                  />
                </div>

                <select
                  value={entityType}
                  onChange={(e) => {
                    setEntityType(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-[20px] border border-[#efe6dc] bg-white px-4 py-3 text-sm text-[#2b2018] shadow-sm outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                >
                  {ENTITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  value={action}
                  onChange={(e) => {
                    setAction(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-[20px] border border-[#efe6dc] bg-white px-4 py-3 text-sm text-[#2b2018] shadow-sm outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                >
                  {ACTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  value={branch}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-[20px] border border-[#efe6dc] bg-white px-4 py-3 text-sm text-[#2b2018] shadow-sm outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                >
                  <option value="">All branches</option>
                  {BRANCH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={actor}
                  onChange={(e) => {
                    setActor(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Actor email or name"
                  className="rounded-[20px] border border-[#efe6dc] bg-white px-4 py-3 text-sm text-[#2b2018] shadow-sm outline-none transition placeholder:text-[#b8a999] focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                />

                <label className="flex items-center gap-3 rounded-[20px] border border-[#efe6dc] bg-white px-4 py-3 text-sm text-[#7f6d60] shadow-sm">
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-[#9a8b7d]">
                    From
                  </span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setPage(1);
                    }}
                    className="w-full bg-transparent text-sm text-[#2b2018] outline-none"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-[20px] border border-[#efe6dc] bg-white px-4 py-3 text-sm text-[#7f6d60] shadow-sm">
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-[#9a8b7d]">
                    To
                  </span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setPage(1);
                    }}
                    className="w-full bg-transparent text-sm text-[#2b2018] outline-none"
                  />
                </label>
              </div>

            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(97,72,56,0.08)] px-7 py-5">
              <p className="text-sm text-[var(--surface-muted)]">
                Showing {logs.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} -{" "}
                {Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} logs
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextPage = Math.max(1, page - 1);
                    setPage(nextPage);
                    void loadLogs(nextPage);
                  }}
                  disabled={page === 1 || loading}
                  className="rounded-full border border-[#efe6dc] bg-white px-4 py-2 text-xs font-semibold text-[#6f5f52] transition hover:border-[#ffb47b] hover:text-[#c96f15] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="rounded-full bg-[var(--accent-soft)] px-4 py-2 text-xs font-semibold text-[#b85d11]">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const nextPage = Math.min(totalPages, page + 1);
                    setPage(nextPage);
                    void loadLogs(nextPage);
                  }}
                  disabled={page === totalPages || loading}
                  className="rounded-full border border-[#efe6dc] bg-white px-4 py-2 text-xs font-semibold text-[#6f5f52] transition hover:border-[#ffb47b] hover:text-[#c96f15] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>

            {loading && logs.length === 0 ? (
              <div className="px-6 py-10 text-sm text-[var(--surface-muted)]">Loading audit trail...</div>
            ) : timelineGroups.length === 0 ? (
              <div className="px-6 py-10 text-sm text-[var(--surface-muted)]">
                No audit logs match your current filters.
              </div>
            ) : (
              <div className="divide-y divide-[#f4ede4]">
                {timelineGroups.map((entry) => {
                  if (entry.type === "date") {
                    return (
                      <div
                        key={entry.key}
                        className="sticky top-0 z-[1] border-b border-[rgba(97,72,56,0.08)] bg-[#fcfaf7] px-7 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]"
                      >
                        {entry.label}
                      </div>
                    );
                  }

                  const log = entry.log;
                  const tone = getToneClasses(log.action);

                  return (
                    <div key={log.id} className="relative px-7 py-6">
                      <div className={`absolute left-0 top-0 h-full w-1 ${tone.accent}`} />
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone.badge}`}>
                              {getActionLabel(log.action)}
                            </span>
                            <span className="rounded-full border border-[#efe6dc] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                              {getEntityLabel(log.entityType)}
                            </span>
                            <span className="rounded-full border border-[#efe6dc] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                              {log.entityId}
                            </span>
                            {log.source && (
                              <span className="rounded-full border border-[#efe6dc] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                                {log.source}
                              </span>
                            )}
                          </div>

                          <h3 className="mt-3 text-[17px] font-semibold text-[#2b2018]">
                            {log.metadata?.summary || `${getActionLabel(log.action)} ${getEntityLabel(log.entityType)}`}
                          </h3>
                          <p className="mt-2 max-w-3xl text-sm leading-7 text-[#6f5f52]">
                            {log.metadata?.details || log.reason || "No additional details were stored for this action."}
                          </p>

                          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="rounded-[20px] border border-[#efe6dc] bg-[#fffdfb] px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a8b7d]">
                                Actor
                              </p>
                              <p className="mt-1 text-sm font-semibold text-[#2b2018]">
                                {log.performedByEmail || log.performedBy || "System"}
                              </p>
                              <p className="mt-1 text-xs text-[#8c7b6d]">
                                {log.performedBy ? `User ID: ${log.performedBy}` : "No actor recorded"}
                              </p>
                            </div>

                            <div className="rounded-[20px] border border-[#efe6dc] bg-[#fffdfb] px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a8b7d]">
                                Context
                              </p>
                              <p className="mt-1 text-sm font-semibold text-[#2b2018]">
                                {branchLabel(log.branch)}
                              </p>
                              <p className="mt-1 text-xs text-[#8c7b6d]">
                                {log.reason ? `Reason: ${log.reason}` : "No reason recorded"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-5 text-[11px] uppercase tracking-[0.18em] text-[#9a8b7d]">
                            {formatTimestamp(log.performedAt)}
                          </div>
                        </div>

                        <div className="min-w-[240px] lg:max-w-[320px]">
                          <details className="rounded-[20px] border border-[#efe6dc] bg-[#fffaf5] p-4">
                            <summary className="cursor-pointer list-none text-sm font-semibold text-[#2b2018]">
                              Before / After
                            </summary>
                            <div className="mt-4 grid gap-3">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a8b7d]">
                                  Before
                                </p>
                                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-[11px] leading-5 text-[#6f5f52]">
                                  {summarizePayload(log.beforeData)}
                                </pre>
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a8b7d]">
                                  After
                                </p>
                                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-[11px] leading-5 text-[#6f5f52]">
                                  {summarizePayload(log.afterData)}
                                </pre>
                              </div>
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
