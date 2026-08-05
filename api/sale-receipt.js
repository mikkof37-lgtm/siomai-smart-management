import nodemailer from "nodemailer";

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

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      name:
        typeof item?.name === "string" && item.name.trim()
          ? item.name.trim()
          : typeof item?.product === "string"
          ? item.product.trim()
          : "",
      qty: Number(item?.qty || 0),
      unit: typeof item?.unit === "string" ? item.unit.trim() : "units",
      unitPrice: Number(item?.unitPrice || 0),
      subtotal: Number(item?.subtotal || 0)
    }))
    .filter((item) => item.name && item.qty > 0);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateReceiptPayload(body) {
  const errors = [];

  if (!isNonEmptyString(body.saleId)) {
    errors.push("saleId is required.");
  }
  if (!isNonEmptyString(body.branch)) {
    errors.push("branch is required.");
  }
  if (!isNonEmptyString(body.saleDate)) {
    errors.push("saleDate is required.");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("items must contain at least one line item.");
  }

  const total = Number(body.total);
  if (!Number.isFinite(total) || total < 0) {
    errors.push("total must be a non-negative number.");
  }

  return errors;
}

function buildTextReceipt({ saleId, branch, saleDate, recordedAt, staffName, items, total, notes }) {
  const lines = [
    "Sio Republic Receipt",
    `Receipt No: ${saleId}`,
    `Branch: ${branch}`,
    `Sale Date: ${saleDate}`,
    `Recorded At: ${recordedAt}`,
    `Recorded By: ${staffName}`,
    "",
    "Items:"
  ];

  items.forEach((item) => {
    lines.push(
      `- ${item.name} x ${item.qty} @ ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.subtotal)}`
    );
  });

  lines.push("", `Total: ${formatCurrency(total)}`);

  if (notes) {
    lines.push(`Notes: ${notes}`);
  }

  return lines.join("\n");
}

function buildHtmlReceipt({ saleId, branch, saleDate, recordedAt, staffName, items, total, notes }) {
  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f0e5d8;">${escapeHtml(item.name)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0e5d8;text-align:center;">${escapeHtml(
            item.qty
          )}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0e5d8;text-align:right;">${escapeHtml(
            item.unit
          )}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0e5d8;text-align:right;">${escapeHtml(
            formatCurrency(item.unitPrice)
          )}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0e5d8;text-align:right;font-weight:600;">${escapeHtml(
            formatCurrency(item.subtotal)
          )}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#fbf8f4;padding:24px;color:#2b2018;">
      <div style="max-width:760px;margin:0 auto;background:#fff;border:1px solid #efe6dc;border-radius:20px;overflow:hidden;box-shadow:0 18px 50px -24px rgba(58,41,29,.35);">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fffdfb 0%,#fff8f1 48%,#fff1e3 100%);border-bottom:1px solid #efe6dc;">
          <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#c96f15;font-weight:700;">Sio Republic</div>
          <h1 style="margin:8px 0 0;font-size:26px;">Sales Receipt</h1>
          <p style="margin:8px 0 0;color:#8c7b6d;">A sale was recorded in the inventory system.</p>
        </div>

        <div style="padding:24px 28px;">
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:20px;">
            <div><div style="font-size:11px;color:#9a8b7d;text-transform:uppercase;letter-spacing:.18em;">Receipt No</div><div style="margin-top:4px;font-weight:700;">${escapeHtml(saleId)}</div></div>
            <div><div style="font-size:11px;color:#9a8b7d;text-transform:uppercase;letter-spacing:.18em;">Branch</div><div style="margin-top:4px;font-weight:700;">${escapeHtml(branch)}</div></div>
            <div><div style="font-size:11px;color:#9a8b7d;text-transform:uppercase;letter-spacing:.18em;">Sale Date</div><div style="margin-top:4px;font-weight:700;">${escapeHtml(saleDate)}</div></div>
            <div><div style="font-size:11px;color:#9a8b7d;text-transform:uppercase;letter-spacing:.18em;">Recorded By</div><div style="margin-top:4px;font-weight:700;">${escapeHtml(staffName)}</div></div>
            <div><div style="font-size:11px;color:#9a8b7d;text-transform:uppercase;letter-spacing:.18em;">Recorded At</div><div style="margin-top:4px;font-weight:700;">${escapeHtml(recordedAt)}</div></div>
          </div>

          <table style="width:100%;border-collapse:collapse;border:1px solid #efe6dc;border-radius:16px;overflow:hidden;">
            <thead>
              <tr style="background:#fcfaf7;">
                <th style="padding:12px;text-align:left;border-bottom:1px solid #efe6dc;">Item</th>
                <th style="padding:12px;text-align:center;border-bottom:1px solid #efe6dc;">Qty</th>
                <th style="padding:12px;text-align:right;border-bottom:1px solid #efe6dc;">Unit</th>
                <th style="padding:12px;text-align:right;border-bottom:1px solid #efe6dc;">Price</th>
                <th style="padding:12px;text-align:right;border-bottom:1px solid #efe6dc;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>

          <div style="margin-top:20px;display:flex;justify-content:flex-end;">
            <div style="min-width:240px;border:1px solid #efe6dc;border-radius:16px;background:#fffaf5;padding:16px 18px;">
              <div style="display:flex;justify-content:space-between;gap:12px;font-weight:700;">
                <span>Total</span>
                <span style="color:#ff7a1a;">${escapeHtml(formatCurrency(total))}</span>
              </div>
              ${notes ? `<p style="margin:10px 0 0;font-size:13px;color:#8c7b6d;">Notes: ${escapeHtml(notes)}</p>` : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const saleId = typeof body.saleId === "string" && body.saleId.trim() ? body.saleId.trim() : `sale-${Date.now()}`;
    const branch = typeof body.branch === "string" ? body.branch.trim() : "";
    const saleDate = typeof body.saleDate === "string" ? body.saleDate.trim() : "";
    const recordedAt = typeof body.recordedAt === "string" ? body.recordedAt.trim() : "";
    const staffName = typeof body.staffName === "string" ? body.staffName.trim() : "Staff";
    const items = normalizeItems(body.items);
    const total = Number(body.total || 0);
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const recipientEmail =
      globalThis.process?.env?.REPORT_TO_EMAIL?.trim() ||
      globalThis.process?.env?.RECEIPT_TO_EMAIL?.trim() ||
      body.recipientEmail?.trim() ||
      "";

    const validationErrors = validateReceiptPayload(body);

    if (!recipientEmail) {
      res.status(200).json({
        sent: false,
        skipped: true,
        error: "No receipt recipient email configured."
      });
      return;
    }

    if (validationErrors.length > 0) {
      res.status(400).json({
        sent: false,
        error: "Missing required receipt details.",
        detail: validationErrors.join(" ")
      });
      return;
    }

    const smtpHost = globalThis.process?.env?.SMTP_HOST?.trim() || "smtp.gmail.com";
    const smtpPort = Number(globalThis.process?.env?.SMTP_PORT || 465);
    const smtpSecure = String(globalThis.process?.env?.SMTP_SECURE || "true").toLowerCase() !== "false";
    const smtpUser = globalThis.process?.env?.SMTP_USER?.trim() || "";
    const smtpPass = globalThis.process?.env?.SMTP_PASS?.trim() || "";
    const fromEmail = globalThis.process?.env?.RECEIPT_FROM_EMAIL?.trim() || smtpUser || recipientEmail;

    if (!smtpUser || !smtpPass || !fromEmail) {
      res.status(200).json({
        sent: false,
        skipped: true,
        error: "SMTP credentials are not configured."
      });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number.isFinite(smtpPort) ? smtpPort : 465,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const subject = `Sio Republic Receipt - ${branch} - ${saleId.slice(-6).toUpperCase()}`;
    const text = buildTextReceipt({ saleId, branch, saleDate, recordedAt, staffName, items, total, notes });
    const html = buildHtmlReceipt({ saleId, branch, saleDate, recordedAt, staffName, items, total, notes });

    await transporter.sendMail({
      from: fromEmail,
      to: recipientEmail,
      subject,
      text,
      html
    });

    res.status(200).json({
      sent: true,
      recipientEmail,
      subject
    });
  } catch (error) {
    res.status(500).json({
      sent: false,
      error: "Receipt email failed.",
      detail: error?.message || "Unknown error"
    });
  }
}
