import { useInventory } from "../context/InventoryContext";
import { useSettings } from "../context/SettingsContext";
import { formatInventoryQuantityForDisplay } from "../utils/siomaiUnits";

export default function RestockList() {
  const { inventory } = useInventory();
  const { settings } = useSettings();

  const attentionItems = inventory
    .map((item) => {
      const isCritical = item.stock < item.threshold * settings.criticalThresholdPercent;
      const isLow = item.stock < item.threshold * settings.lowThresholdMultiplier;
      const suggestedOrder = Number.isFinite(Number(item.maxStock))
        ? Math.max(0, Number(item.maxStock) - Number(item.stock || 0))
        : Math.max(0, Number(item.threshold || 0) - Number(item.stock || 0));

      return {
        ...item,
        isCritical,
        isLow,
        suggestedOrder
      };
    })
    .filter((item) => item.isLow)
    .sort((left, right) => {
      if (left.isCritical !== right.isCritical) return left.isCritical ? -1 : 1;
      return right.suggestedOrder - left.suggestedOrder;
    })
    .slice(0, 6);

  return (
    <div className="rounded-[28px] border border-[var(--surface-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,251,247,0.9)_100%)] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
            Stock watch
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--app-text)]">Restock Suggestions</h2>
        </div>
      </div>

      <div className="max-h-72 space-y-4 overflow-y-auto pr-2">
        {attentionItems.length === 0 && (
          <p className="text-sm text-[var(--surface-muted)]">All stock levels are healthy right now.</p>
        )}

        {attentionItems.map((item) => {
          const label = item.isCritical ? "CRITICAL" : "LOW";
          const badgeClass = item.isCritical
            ? "bg-[#ffeceb] text-[#d9413e]"
            : "bg-[#fff0d8] text-[#b85d11]";

          return (
            <div
              key={item.id}
              className="rounded-[22px] border border-[var(--surface-border)] bg-white/85 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--app-text)]">{item.name}</p>
                  <p className="text-xs text-[var(--surface-muted)]">
                    Current:{" "}
                    {formatInventoryQuantityForDisplay(item, item.stock, item.unit || "units")}{" "}
                    · Threshold:{" "}
                    {formatInventoryQuantityForDisplay(item, item.threshold, item.unit || "units")}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#b85d11]">
                    Suggested order:{" "}
                    {formatInventoryQuantityForDisplay(
                      item,
                      item.suggestedOrder,
                      item.unit || "units"
                    )}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${badgeClass}`}>
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
