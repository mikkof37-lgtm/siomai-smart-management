import { useInventory } from "../context/InventoryContext";
import { useSettings } from "../context/SettingsContext";

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

<div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
  <div className="mb-4 flex items-center justify-between">
    <h2 className="text-sm font-semibold text-[#2b2018]">Smart Restock Suggestions</h2>
  </div>

  <div className="max-h-72 space-y-4 overflow-y-auto pr-2">
    {attentionItems.length === 0 && (
      <p className="text-sm text-[#9a8b7d]">All stock levels are healthy.</p>
    )}

    {attentionItems.map((item) => {
      const label = item.isCritical ? "CRITICAL" : "LOW";
      const badgeClass = item.isCritical
        ? "bg-[#ffeceb] text-[#ff4d4f]"
        : "bg-[#fff0d8] text-[#c06b1d]";

      return (
        <div
          key={item.id}
          className="rounded-2xl border border-[#f2eae0] bg-[#fffaf5] px-4 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#2b2018]">{item.name}</p>
              <p className="text-xs text-[#9a8b7d]">
                Current: {item.stock} {item.unit || "units"} · Threshold: {item.threshold}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#c06b1d]">
                Suggested order: {item.suggestedOrder} {item.unit || "units"}
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
