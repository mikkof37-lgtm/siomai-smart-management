const SALE_DATE_DISPLAY_OPTIONS = {
  month: "short",
  day: "2-digit",
  year: "numeric"
};

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseSaleDateValue(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    const localDate = new Date(year, month, day);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeSaleDateValue(value) {
  const parsed = parseSaleDateValue(value);
  if (parsed) return toIsoDate(parsed);
  return typeof value === "string" ? value.trim() : "";
}

export function saleDateKey(value) {
  return normalizeSaleDateValue(value);
}

export function formatSaleDate(value) {
  const parsed = parseSaleDateValue(value);
  if (!parsed) {
    return typeof value === "string" ? value.trim() : "";
  }

  return parsed.toLocaleDateString("en-US", SALE_DATE_DISPLAY_OPTIONS);
}
