const SETTINGS_STORAGE_KEY = "smart_inventory_settings";

export const defaultSettings = {
  lowThresholdMultiplier: 1,
  criticalThresholdPercent: 0.5,
  notifyLow: true,
  notifyCritical: true,
  alertFrequency: "instant"
};

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeSettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};

  const lowThresholdMultiplier = toFiniteNumber(
    source.lowThresholdMultiplier,
    defaultSettings.lowThresholdMultiplier
  );
  const criticalThresholdPercent = Math.min(
    1,
    Math.max(
      0,
      toFiniteNumber(source.criticalThresholdPercent, defaultSettings.criticalThresholdPercent)
    )
  );
  const alertFrequency =
    source.alertFrequency === "instant" ||
    source.alertFrequency === "daily" ||
    source.alertFrequency === "weekly"
      ? source.alertFrequency
      : defaultSettings.alertFrequency;

  return {
    lowThresholdMultiplier: Math.max(0, lowThresholdMultiplier),
    criticalThresholdPercent,
    notifyLow: source.notifyLow !== undefined ? Boolean(source.notifyLow) : defaultSettings.notifyLow,
    notifyCritical:
      source.notifyCritical !== undefined ? Boolean(source.notifyCritical) : defaultSettings.notifyCritical,
    alertFrequency
  };
}

export function loadStoredSettings() {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!stored) return defaultSettings;

  try {
    const parsed = JSON.parse(stored);
    return normalizeSettings(parsed);
  } catch {
    return defaultSettings;
  }
}

export function saveStoredSettings(settings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
}

export function resetStoredSettings() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SETTINGS_STORAGE_KEY);
}

