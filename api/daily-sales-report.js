import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const SALES_TABLE = globalThis.process?.env?.SUPABASE_SALES_TABLE ||
  globalThis.process?.env?.VITE_SUPABASE_SALES_TABLE ||
  "sales_records";
const SALE_BRANCH_PREFIX = "__smart_inventory_branch__:";
const TIMEZONE_OFFSET_HOURS = Number(globalThis.process?.env?.REPORT_TIMEZONE_OFFSET_HOURS || 8);

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `PHP ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatLocalDateTime(value) {
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

function formatLocalDateLabel(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "";

  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function normalizeBranch(branch) {
  return typeof branch === "string" && branch.trim() ? branch.trim() : "Unassigned";
}

function decodeSaleNotes(notes) {
  const text = typeof notes === "string" ? notes : "";
  if (!text.startsWith(SALE_BRANCH_PREFIX)) {
    return { branch: "", notes: text };
  }

  const remainder = text.slice(SALE_BRANCH_PREFIX.length);
  const newlineIndex = remainder.indexOf("\n");
  const branchToken = newlineIndex >= 0 ? remainder.slice(0, newlineIndex) : remainder;
  const cleanedNotes = newlineIndex >= 0 ? remainder.slice(newlineIndex + 1) : "";

  try {
    return {
      branch: decodeURIComponent(branchToken),
      notes: cleanedNotes
    };
  } catch {
    return {
      branch: branchToken,
      notes: cleanedNotes
    };
  }
}

function normalizeSale(sale) {
  const decodedNotes = decodeSaleNotes(sale.notes);
  return {
    id: String(sale.id ?? sale.sale_id ?? ""),
    branch: normalizeBranch(sale.branch || decodedNotes.branch),
    product:
      typeof sale.inventory_item_name === "string" && sale.inventory_item_name.trim()
        ? sale.inventory_item_name.trim()
        : typeof sale.product === "string" && sale.product.trim()
        ? sale.product.trim()
        : "Unknown item",
    qty: Number(sale.qty || 0),
    price: Number(sale.price || 0),
    notes: decodedNotes.notes,
    createdAt:
      typeof sale.created_at === "string"
        ? sale.created_at
        : typeof sale.createdAt === "string"
        ? sale.createdAt
        : ""
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getReportWindow(now = new Date()) {
  const offsetMs = TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
  const localNow = new Date(now.getTime() + offsetMs);
  const year = localNow.getUTCFullYear();
  const month = localNow.getUTCMonth();
  const day = localNow.getUTCDate();
  const startUtc = new Date(Date.UTC(year, month, day, 0, 0, 0) - offsetMs);
  const endUtc = new Date(Date.UTC(year, month, day, 20, 0, 0) - offsetMs);

  return {
    startUtc,
    endUtc,
    reportDateLabel: formatLocalDateLabel(endUtc),
    windowLabel: `${formatLocalDateTime(startUtc)} to ${formatLocalDateTime(endUtc)}`
  };
}

function groupSales(sales) {
  const branches = new Map();
  let grandTotal = 0;
  let totalQty = 0;

  sales.forEach((sale) => {
    const branchKey = sale.branch;
    const branchGroup =
      branches.get(branchKey) ||
      {
        branch: branchKey,
        items: new Map(),
        totalQty: 0,
        totalRevenue: 0
      };

    const itemKey = `${sale.product}::${sale.price}`;
    const itemGroup =
      branchGroup.items.get(itemKey) ||
      {
        name: sale.product,
        qty: 0,
        unitPrice: sale.price,
        subtotal: 0
      };

    const subtotal = Number(sale.qty || 0) * Number(sale.price || 0);
    itemGroup.qty += Number(sale.qty || 0);
    itemGroup.subtotal += subtotal;
    branchGroup.items.set(itemKey, itemGroup);

    branchGroup.totalQty += Number(sale.qty || 0);
    branchGroup.totalRevenue += subtotal;
    branches.set(branchKey, branchGroup);

    totalQty += Number(sale.qty || 0);
    grandTotal += subtotal;
  });

  return {
    branches: [...branches.values()].map((branch) => ({
      ...branch,
      items: [...branch.items.values()].sort((a, b) => a.name.localeCompare(b.name))
    })),
    grandTotal,
    totalQty
  };
}

function buildTextReport({ reportDateLabel, windowLabel, branches, grandTotal, totalQty, saleCount }) {
  const lines = [
    "Sio Republic Daily Sales Report",
    `Report Date: ${reportDateLabel}`,
    `Window: ${windowLabel}`,
    `Sales Records: ${saleCount}`,
    `Total Units Sold: ${totalQty}`,
    `Grand Total: ${formatCurrency(grandTotal)}`,
    ""
  ];

  if (!branches.length) {
    lines.push("No sales were recorded for this cutoff window.");
    return lines.join("\n");
  }

  branches.forEach((branch) => {
    lines.push(`${branch.branch}`);
    branch.items.forEach((item) => {
      lines.push(
        `- ${item.name} x ${item.qty} @ ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.subtotal)}`
      );
    });
    lines.push(
      `  Branch Total: ${formatCurrency(branch.totalRevenue)}`,
      `  Units Sold: ${branch.totalQty}`,
      ""
    );
  });

  return lines.join("\n").trim();
}

function buildHtmlReport({ reportDateLabel, windowLabel, branches, grandTotal, totalQty, saleCount }) {
  const branchMarkup = !branches.length
    ? `<div style="padding:18px;border:1px dashed #e8ddd0;border-radius:16px;background:#fffaf5;color:#8c7b6d;">No sales were recorded for this cutoff window.</div>`
    : branches
        .map(
          (branch) => `
            <div style="border:1px solid #efe6dc;border-radius:18px;overflow:hidden;background:#fffdfb;">
              <div style="padding:16px 18px;background:#fcfaf7;border-bottom:1px solid #f2eae0;">
                <div style="font-size:18px;font-weight:700;color:#2b2018;">${escapeHtml(branch.branch)}</div>
                <div style="margin-top:4px;font-size:13px;color:#8c7b6d;">Units sold: ${escapeHtml(branch.totalQty)} | Branch total: ${escapeHtml(formatCurrency(branch.totalRevenue))}</div>
              </div>
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="background:#fffaf5;">
                    <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #efe6dc;">Item</th>
                    <th style="padding:10px 12px;text-align:center;border-bottom:1px solid #efe6dc;">Qty</th>
                    <th style="padding:10px 12px;text-align:right;border-bottom:1px solid #efe6dc;">Unit Price</th>
                    <th style="padding:10px 12px;text-align:right;border-bottom:1px solid #efe6dc;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${branch.items
                    .map(
                      (item) => `
                        <tr>
                          <td style="padding:10px 12px;border-bottom:1px solid #f4ede4;">${escapeHtml(item.name)}</td>
                          <td style="padding:10px 12px;border-bottom:1px solid #f4ede4;text-align:center;">${escapeHtml(item.qty)}</td>
                          <td style="padding:10px 12px;border-bottom:1px solid #f4ede4;text-align:right;">${escapeHtml(formatCurrency(item.unitPrice))}</td>
                          <td style="padding:10px 12px;border-bottom:1px solid #f4ede4;text-align:right;font-weight:700;">${escapeHtml(formatCurrency(item.subtotal))}</td>
                        </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
        )
        .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#fbf8f4;padding:24px;color:#2b2018;">
      <div style="max-width:920px;margin:0 auto;background:#fff;border:1px solid #efe6dc;border-radius:20px;overflow:hidden;box-shadow:0 18px 50px -24px rgba(58,41,29,.35);">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fffdfb 0%,#fff8f1 48%,#fff1e3 100%);border-bottom:1px solid #efe6dc;">
          <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#c96f15;font-weight:700;">Sio Republic</div>
          <h1 style="margin:8px 0 0;font-size:28px;">Daily Sales Report</h1>
          <p style="margin:8px 0 0;color:#8c7b6d;">Cutoff report grouped by branch, sent at 8:00 PM.</p>
        </div>

        <div style="padding:24px 28px;">
          <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:22px;">
            <div><div style="font-size:11px;color:#9a8b7d;text-transform:uppercase;letter-spacing:.18em;">Report Date</div><div style="margin-top:4px;font-weight:700;">${escapeHtml(reportDateLabel)}</div></div>
            <div><div style="font-size:11px;color:#9a8b7d;text-transform:uppercase;letter-spacing:.18em;">Cutoff Window</div><div style="margin-top:4px;font-weight:700;">${escapeHtml(windowLabel)}</div></div>
            <div><div style="font-size:11px;color:#9a8b7d;text-transform:uppercase;letter-spacing:.18em;">Sales Records</div><div style="margin-top:4px;font-weight:700;">${escapeHtml(saleCount)}</div></div>
            <div><div style="font-size:11px;color:#9a8b7d;text-transform:uppercase;letter-spacing:.18em;">Grand Total</div><div style="margin-top:4px;font-weight:700;color:#ff7a1a;">${escapeHtml(formatCurrency(grandTotal))}</div></div>
          </div>

          <div style="margin-bottom:18px;display:flex;gap:18px;flex-wrap:wrap;">
            <div style="font-size:14px;color:#6f5f52;"><strong>Total Units Sold:</strong> ${escapeHtml(totalQty)}</div>
          </div>

          <div style="display:grid;gap:18px;">
            ${branchMarkup}
          </div>
        </div>
      </div>
    </div>
  `;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    if (req.method === "POST") {
      const body = await readJsonBody(req);
      if (body && !isPlainObject(body)) {
        res.status(400).json({
          sent: false,
          error: "Invalid request payload.",
          detail: "The request body must be a JSON object."
        });
        return;
      }
    }

    const supabaseUrl =
      globalThis.process?.env?.SUPABASE_URL?.trim() ||
      globalThis.process?.env?.VITE_SUPABASE_URL?.trim() ||
      "";
    const serviceRoleKey = globalThis.process?.env?.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

    if (!supabaseUrl || !serviceRoleKey) {
      res.status(200).json({
        sent: false,
        skipped: true,
        error: "Supabase service credentials are not configured."
      });
      return;
    }

    const reportToEmail =
      globalThis.process?.env?.REPORT_TO_EMAIL?.trim() ||
      globalThis.process?.env?.RECEIPT_TO_EMAIL?.trim() ||
      "";

    if (!reportToEmail) {
      res.status(200).json({
        sent: false,
        skipped: true,
        error: "No report recipient email configured."
      });
      return;
    }

    const smtpHost = globalThis.process?.env?.SMTP_HOST?.trim() || "smtp.gmail.com";
    const smtpPort = Number(globalThis.process?.env?.SMTP_PORT || 465);
    const smtpSecure = String(globalThis.process?.env?.SMTP_SECURE || "true").toLowerCase() !== "false";
    const smtpUser = globalThis.process?.env?.SMTP_USER?.trim() || reportToEmail;
    const smtpPass = globalThis.process?.env?.SMTP_PASS?.trim() || "";
    const fromEmail =
      globalThis.process?.env?.REPORT_FROM_EMAIL?.trim() ||
      globalThis.process?.env?.RECEIPT_FROM_EMAIL?.trim() ||
      smtpUser;

    if (!smtpUser || !smtpPass || !fromEmail) {
      res.status(200).json({
        sent: false,
        skipped: true,
        error: "SMTP credentials are not configured."
      });
      return;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { startUtc, endUtc, reportDateLabel, windowLabel } = getReportWindow(new Date());
    const { data, error } = await supabase
      .from(SALES_TABLE)
      .select("id, product, qty, price, created_at, inventory_item_name, notes")
      .gte("created_at", startUtc.toISOString())
      .lt("created_at", endUtc.toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    const sales = Array.isArray(data) ? data.map(normalizeSale) : [];
    const { branches, grandTotal, totalQty } = groupSales(sales);

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number.isFinite(smtpPort) ? smtpPort : 465,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const subject = `Sio Republic Daily Sales Report - ${reportDateLabel}`;
    const text = buildTextReport({
      reportDateLabel,
      windowLabel,
      branches,
      grandTotal,
      totalQty,
      saleCount: sales.length
    });
    const html = buildHtmlReport({
      reportDateLabel,
      windowLabel,
      branches,
      grandTotal,
      totalQty,
      saleCount: sales.length
    });

    await transporter.sendMail({
      from: fromEmail,
      to: reportToEmail,
      subject,
      text,
      html
    });

    res.status(200).json({
      sent: true,
      recipientEmail: reportToEmail,
      subject,
      saleCount: sales.length
    });
  } catch (error) {
    res.status(500).json({
      sent: false,
      error: "Daily sales report failed.",
      detail: error?.message || "Unknown error"
    });
  }
}
