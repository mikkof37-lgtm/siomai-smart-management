import { describe, expect, test, beforeEach } from "vitest";
import {
  defaultSettings,
  loadStoredSettings,
  normalizeSettings,
  resetStoredSettings,
  saveStoredSettings
} from "../src/utils/settings.js";

describe("settings helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoredSettings();
  });

  test("normalizeSettings clamps invalid values and falls back to defaults", () => {
    const result = normalizeSettings({
      lowThresholdMultiplier: "2.5",
      criticalThresholdPercent: "1.4",
      notifyLow: 0,
      notifyCritical: "yes",
      alertFrequency: "hourly"
    });

    expect(result).toEqual({
      lowThresholdMultiplier: 2.5,
      criticalThresholdPercent: 1,
      notifyLow: false,
      notifyCritical: true,
      alertFrequency: defaultSettings.alertFrequency
    });
  });

  test("saveStoredSettings persists normalized settings and loadStoredSettings reads them back", () => {
    saveStoredSettings({
      lowThresholdMultiplier: 1.5,
      criticalThresholdPercent: 0.25,
      notifyLow: false,
      notifyCritical: true,
      alertFrequency: "daily"
    });

    expect(loadStoredSettings()).toEqual({
      lowThresholdMultiplier: 1.5,
      criticalThresholdPercent: 0.25,
      notifyLow: false,
      notifyCritical: true,
      alertFrequency: "daily"
    });
  });
});

