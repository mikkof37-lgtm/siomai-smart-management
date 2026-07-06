import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { useInventory } from "../context/InventoryContext";
import { useSettings } from "../context/SettingsContext";

const getRestockData = (item, settings) => {
  const isCritical = item.stock < item.threshold * settings.criticalThresholdPercent;
  const isLow = item.stock < item.threshold * settings.lowThresholdMultiplier;
  const suggestedOrder = Number.isFinite(Number(item.maxStock))
    ? Math.max(0, Number(item.maxStock) - Number(item.stock || 0))
    : Math.max(0, Number(item.threshold || 0) - Number(item.stock || 0));

  const priority = isCritical ? "Critical" : isLow ? "Low" : "Healthy";

  return {
    ...item,
    isCritical,
    isLow,
    suggestedOrder,
    priority
  };
};

export default function RestockOrders({ onLogout }) {
  const { inventory } = useInventory();
  const { settings } = useSettings();

  const restockItems = inventory.map((item) => getRestockData(item, settings));
  const attentionItems = restockItems.filter((item) => item.isLow);
  const criticalCount = restockItems.filter((item) => item.isCritical).length;
  const lowCount = attentionItems.length;
  const totalSuggested = attentionItems.reduce((sum, item) => sum + item.suggestedOrder, 0);

  return (
    <div className="flex min-h-screen bg-[#fbf8f4]">
      <Sidebar onLogout={onLogout} />
        <div className="flex-1">
        <TopBar title="Restock Orders" subtitle="Rule-based list of items that need to be ordered." />
        <div className="px-8 pb-10 pt-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-[#2b2018] mb-2">Restock Orders</h1>
              <p className="text-sm text-[#8c7b6d]">
                Use this page when you need to decide what to buy right now.
                Suggestions are based on current stock, thresholds, and max stock limits.
              </p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <p className="text-sm text-[#8c7b6d]">Critical items</p>
              <p className="mt-2 text-3xl font-semibold text-[#ff4d4f]">{criticalCount}</p>
            </div>
            <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <p className="text-sm text-[#8c7b6d]">Items to reorder</p>
              <p className="mt-2 text-3xl font-semibold text-[#c06b1d]">{lowCount}</p>
            </div>
            <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <p className="text-sm text-[#8c7b6d]">Suggested total</p>
              <p className="mt-2 text-3xl font-semibold text-[#2b2018]">{totalSuggested}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#efe6dc] bg-white shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b border-[#f2eae0] px-6 py-3 text-xs font-semibold text-[#9a8b7d]">
              <div>Item</div>
              <div className="text-center">Current Stock</div>
              <div className="text-center">Suggested</div>
              <div className="text-center">Priority</div>
              <div className="text-right">Unit Cost</div>
            </div>

            <div className="divide-y divide-[#f4ede4]">
              {attentionItems.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-[#9a8b7d]">
                  No restock items yet. Everything is above the low-stock threshold.
                </div>
              )}

              {attentionItems.map((item) => {
                const priorityClass = item.isCritical
                  ? "bg-[#ffeceb] text-[#ff4d4f]"
                  : "bg-[#fff0d8] text-[#c06b1d]";

                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center px-6 py-4 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#2b2018]">{item.name}</p>
                      <p className="text-xs text-[#9a8b7d]">
                        Threshold: {item.threshold} {item.unit || "units"}
                      </p>
                    </div>
                    <div className="text-center font-semibold text-[#2b2018]">
                      {item.stock} {item.unit || "units"}
                    </div>
                    <div className="text-center font-semibold text-[#c06b1d]">
                      {item.suggestedOrder} {item.unit || "units"}
                    </div>
                    <div className="text-center">
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${priorityClass}`}>
                        {item.priority.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-right text-[#8c7b6d]">
                      PHP {Number(item.price || 0).toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
