/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState } from "react";
import {
  defaultSettings,
  loadStoredSettings,
  normalizeSettings,
  resetStoredSettings,
  saveStoredSettings
} from "../utils/settings";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState(() => loadStoredSettings());

  const setSettings = (value) => {
    setSettingsState((current) => {
      const next = normalizeSettings(typeof value === "function" ? value(current) : value);
      saveStoredSettings(next);
      return next;
    });
  };

  const resetSettings = () => {
    resetStoredSettings();
    setSettingsState(defaultSettings);
  };

  const value = useMemo(() => {
    return { settings, setSettings, resetSettings };
  }, [settings]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}
