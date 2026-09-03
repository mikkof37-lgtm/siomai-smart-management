import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { useInventory } from "../context/InventoryContext";
import { useSettings } from "../context/SettingsContext";
import { formatInventoryQuantityForDisplay } from "../utils/siomaiUnits";

const getRestockData = (item, settings) => {
  const isCritical = item.stock < item.threshold * settings.criticalThresholdPercent;
  const isLow = item.stock < item.threshold * settings.lowThresholdMultiplier;
  const suggestedOrder = Number.isFinite(Number(item.maxStock))
    ? Math.max(0, Number(item.maxStock) - Number(item.stock || 0))
    : Math.max(0, Number(item.threshold || 0) - Number(item.stock || 0));

  const priority = isCritical ? "Very Low" : isLow ? "Low" : "Healthy";

  return {
    ...item,
    isCritical,
    isLow,
    suggestedOrder,
    priority
  };
};

export default function RestockOrders({ onLogout, currentUser }) {
  const { inventory } = useInventory();
  const { settings } = useSettings();

  const restockItems = inventory.map((item) => getRestockData(item, settings));
  const attentionItems = restockItems.filter((item) => item.isLow);
  const criticalCount = restockItems.filter((item) => item.isCritical).length;
  const lowCount = attentionItems.length;
  const totalSuggested = attentionItems.reduce((sum, item) => sum + item.suggestedOrder, 0);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--app-bg)] md:flex-row">
      <Sidebar currentUser={currentUser} />
      <div className="flex-1">
        <TopBar
          title="Restock Orders"
          subtitle="Rule-based list of items that need to be ordered."
          onLogout={onLogout}
          currentUser={currentUser}
        />
        <div className="px-4 pb-28 pt-4 sm:px-6 sm:pb-28 sm:pt-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 text-2xl font-semibold text-[#2b2018]">Restock Orders</h1>
              <p className="text-sm text-[#8c7b6d]">
                Use this page when you need to decide what to buy right now.
                Suggestions are based on current stock, thresholds, and max stock limits.
              </p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
            <div className="rounded-2xl border border-[#efe6dc] bg-white p-3 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)] sm:p-5">
              <p className="text-xs text-[#8c7b6d] sm:text-sm">Critical items</p>
              <p className="mt-1 text-2xl font-semibold text-[#ff4d4f] sm:mt-2 sm:text-3xl">{criticalCount}</p>
            </div>
            <div className="rounded-2xl border border-[#efe6dc] bg-white p-3 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)] sm:p-5">
              <p className="text-xs text-[#8c7b6d] sm:text-sm">Items to reorder</p>
              <p className="mt-1 text-2xl font-semibold text-[#c06b1d] sm:mt-2 sm:text-3xl">{lowCount}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-[#efe6dc] bg-white p-3 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)] sm:p-5 md:col-span-1">
              <p className="text-xs text-[#8c7b6d] sm:text-sm">Suggested total</p>
              <p className="mt-1 text-2xl font-semibold text-[#2b2018] sm:mt-2 sm:text-3xl">{totalSuggested}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#efe6dc] bg-white shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
            <div className="space-y-4 p-4 md:hidden">
              {attentionItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#e8ddd0] bg-[#fcfaf7] px-5 py-8 text-center text-sm text-[#9a8b7d]">
                  No restock items yet. Everything is above the low-stock threshold.
                </div>
              ) : (
                attentionItems.map((item) => {
                  const priorityClass = item.isCritical
                    ? "bg-[#ffeceb] text-[#ff4d4f]"
                    : "bg-[#fff0d8] text-[#c06b1d]";

                  return (
                    <div key={item.id} className="rounded-2xl border border-[#efe6dc] bg-[#fffdfb] p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-[#2b2018]">{item.name}</p>
                          <p className="mt-1 text-xs text-[#9a8b7d]">
                            Threshold: {item.threshold} {item.unit || "units"}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${priorityClass}`}>
                          {item.priority.toUpperCase()}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9a8b7d]">
                            Current Stock
                          </p>
                          <p className="mt-1 font-semibold text-[#2b2018]">
                            {formatInventoryQuantityForDisplay(item, item.stock, item.unit || "units")}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9a8b7d]">
                            Suggested
                          </p>
                          <p className="mt-1 font-semibold text-[#c06b1d]">
                            {formatInventoryQuantityForDisplay(item, item.suggestedOrder, item.unit || "units")}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9a8b7d]">
                            Unit Cost
                          </p>
                          <p className="mt-1 font-semibold text-[#8c7b6d]">
                            PHP {Number(item.price || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden md:block">
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
                        {formatInventoryQuantityForDisplay(item, item.stock, item.unit || "units")}
                      </div>
                      <div className="text-center font-semibold text-[#c06b1d]">
                        {formatInventoryQuantityForDisplay(item, item.suggestedOrder, item.unit || "units")}
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
    </div>
  );
}
