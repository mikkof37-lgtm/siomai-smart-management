import Sidebar from "../components/Sidebar";
import StatsCard from "../components/StatsCard";
import ForecastChart from "../components/ForecastChart";
import RestockList from "../components/RestockList";
import TopBar from "../components/TopBar";
import { useInventory } from "../context/InventoryContext";
import { useSettings } from "../context/SettingsContext";
import { useSales } from "../context/SalesContext";

export default function Dashboard({ onLogout, currentUser }) {
  const { inventory } = useInventory();
  const { settings } = useSettings();
  const { totalRevenue } = useSales();

  const totalItems = inventory.length;
  const lowStockCount = inventory.filter(
    (item) => item.stock < item.threshold * settings.lowThresholdMultiplier
  ).length;
  const revenueChange =
    totalRevenue === 0 ? "No sales recorded yet" : "Pulled live from sales history";
  const restockSuggestions = lowStockCount;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--app-bg)] md:flex-row">
      <Sidebar currentUser={currentUser} />

      <div className="flex-1">
        <TopBar
          title="Dashboard"
          subtitle="A quick read on sales, stock pressure, and what needs attention first."
          onLogout={onLogout}
          currentUser={currentUser}
        />

        <div className="px-4 pb-28 pt-4 sm:px-6 sm:pb-28 sm:pt-6 lg:px-8">
          <div className="mb-6 overflow-hidden rounded-[28px] border border-[var(--surface-border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(255,249,243,0.95)_56%,rgba(255,240,224,0.9)_100%)] shadow-[var(--shadow-soft)]">
            <div className="px-6 py-6 sm:py-7">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b85d11]">
                  Live branch overview
                </div>
                <h1 className="max-w-2xl text-3xl font-semibold text-[var(--app-text)] sm:text-4xl">
                  Keep the floor moving and spot what needs attention first.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--surface-muted)]">
                  This view keeps the daily numbers in one place: sales, stock pressure, and the next
                  items that deserve a look.
                </p>
              </div>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <StatsCard
              title="Sales this month"
              value={`PHP ${totalRevenue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}`}
              desc={revenueChange}
              trend="up"
              descClassName={totalRevenue === 0 ? "text-[var(--surface-muted)]" : "text-[#1f8f5f]"}
              iconBg="bg-[#fff1e3]"
              iconColor="text-[#f46f1a]"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              }
            />

            <StatsCard
              title="SKUs tracked"
              value={totalItems.toString()}
              desc="Items in the system"
              trend="neutral"
              descClassName="text-[var(--surface-muted)]"
              iconBg="bg-[#e8f7ee]"
              iconColor="text-[#22a06b]"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7 12 3l8 4-8 4-8-4Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M4 7v10l8 4 8-4V7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            />

            <StatsCard
              title="Low stock"
              value={lowStockCount.toString()}
              desc="Need attention"
              trend="down"
              descClassName="text-[#d65b4d]"
              iconBg="bg-[#ffeceb]"
              iconColor="text-[#d65b4d]"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path
                    d="M10.3 4.9 4.1 15.6a2 2 0 0 0 1.7 3h12.4a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              }
            />

            <StatsCard
              title="Restock cues"
              value={restockSuggestions.toString()}
              desc="Based on thresholds"
              trend="neutral"
              descClassName="text-[var(--surface-muted)]"
              iconBg="bg-[#fff3e6]"
              iconColor="text-[#b85d11]"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 4v3m0 10v3M7 12h10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                </svg>
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <ForecastChart />
            <RestockList />
          </div>
        </div>
      </div>
    </div>
  );
}
