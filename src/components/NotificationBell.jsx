import { useEffect, useMemo, useState } from "react";
import { useInventory } from "../context/InventoryContext";
import { useSettings } from "../context/SettingsContext";

const READ_ALERTS_STORAGE_KEY = "smart_inventory_read_low_stock_alerts";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [readAlerts, setReadAlerts] = useState(() => {
    const stored = localStorage.getItem(READ_ALERTS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch {
        // Ignore invalid storage and fall back to empty read state.
      }
    }
    return {};
  });
  const { inventory } = useInventory();
  const { settings } = useSettings();

  const lowStockItems = useMemo(() => {
    return inventory.filter(
      (item) => item.stock < item.threshold * settings.lowThresholdMultiplier
    );
  }, [inventory, settings.lowThresholdMultiplier]);

  const lowStockAlertKeysById = useMemo(() => {
    return lowStockItems.reduce((acc, item) => {
      acc[item.id] = `${item.id}:${item.stock}:${item.threshold}:${settings.lowThresholdMultiplier}`;
      return acc;
    }, {});
  }, [lowStockItems, settings.lowThresholdMultiplier]);

  useEffect(() => {
    localStorage.setItem(READ_ALERTS_STORAGE_KEY, JSON.stringify(readAlerts));
  }, [readAlerts]);

  useEffect(() => {
    setReadAlerts((prev) => {
      const next = {};
      let changed = false;

      Object.keys(prev).forEach((id) => {
        if (lowStockAlertKeysById[id]) {
          next[id] = prev[id];
        } else {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [lowStockAlertKeysById]);

  const unreadCount = lowStockItems.filter((item) => {
    return readAlerts[item.id] !== lowStockAlertKeysById[item.id];
  }).length;

  const markAsRead = (item) => {
    setReadAlerts((prev) => ({
      ...prev,
      [item.id]: lowStockAlertKeysById[item.id]
    }));
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#efe5db] bg-white text-[#7f6d60] shadow-sm transition hover:text-[#ff7a1a]"
        aria-label="Low stock notifications"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path
            d="M15 17H9m8-4V9a5 5 0 10-10 0v4l-2 2v1h14v-1l-2-2Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-[#ff6a5a] px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[calc(100vw-2rem)] max-w-72 overflow-hidden rounded-2xl border border-[#efe6dc] bg-white shadow-[0_18px_50px_-24px_rgba(58,41,29,0.6)]">
          <div className="flex items-center justify-between border-b border-[#f2eae0] px-4 py-3">
            <div className="text-sm font-semibold text-[#2b2018]">
              Low Stock Alerts
            </div>
            <span className="rounded-full bg-[#fff3d8] px-2 py-0.5 text-[11px] font-semibold text-[#c27a1a]">
              {unreadCount} unread
            </span>
          </div>
          <div className="max-h-64 divide-y divide-[#f4ede4] overflow-auto">
            {lowStockItems.length === 0 ? (
              <div className="px-4 py-4 text-sm text-[#8c7b6d]">
                All stock levels are healthy.
              </div>
            ) : (
              lowStockItems.slice(0, 6).map((item) => {
                const isCritical =
                  item.stock < item.threshold * settings.criticalThresholdPercent;
                const isRead =
                  readAlerts[item.id] === lowStockAlertKeysById[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => markAsRead(item)}
                    className={`w-full px-4 py-3 text-left transition ${
                      isRead ? "bg-[#fcf9f5]" : "hover:bg-[#fff8f0]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div
                          className={`text-sm font-semibold ${
                            isRead ? "text-[#6f5f54]" : "text-[#2b2018]"
                          }`}
                        >
                          {item.name}
                        </div>
                        <div
                          className={`text-xs ${
                            isRead ? "text-[#9d8f84]" : "text-[#8c7b6d]"
                          }`}
                        >
                          {item.stock} / {item.threshold} {item.unit || "units"}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isCritical
                            ? "bg-[#ffeceb] text-[#ff4d4f]"
                            : "bg-[#fff3d8] text-[#c27a1a]"
                        }`}
                      >
                        {isCritical ? "CRITICAL" : "LOW"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          {lowStockItems.length > 6 && (
            <div className="border-t border-[#f2eae0] px-4 py-3 text-xs text-[#8c7b6d]">
              {lowStockItems.length - 6} more item
              {lowStockItems.length - 6 === 1 ? "" : "s"} need attention.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
