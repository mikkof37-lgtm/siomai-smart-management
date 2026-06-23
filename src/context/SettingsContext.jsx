import { createContext, useContext, useMemo, useState } from "react";

const defaultSettings = {
  lowThresholdMultiplier: 1,
  criticalThresholdPercent: 0.5,
  notifyLow: true,
  notifyCritical: true,
  alertFrequency: "instant"
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);

  const resetSettings = () => {
    setSettings(defaultSettings);
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

