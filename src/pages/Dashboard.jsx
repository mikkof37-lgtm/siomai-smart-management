import Sidebar from "../components/Sidebar"
import StatsCard from "../components/StatsCard"
import ForecastChart from "../components/ForecastChart"
import RestockList from "../components/RestockList"
import TopBar from "../components/TopBar"
import { useInventory } from "../context/InventoryContext"
import { useSettings } from "../context/SettingsContext"
import { useSales } from "../context/SalesContext"

export default function Dashboard({ onLogout }){

const { inventory } = useInventory();
const { settings } = useSettings();
const totalItems = inventory.length;
const lowStockCount = inventory.filter(
  item => item.stock < item.threshold * settings.lowThresholdMultiplier
).length;
const { totalRevenue } = useSales();
const revenueChange = totalRevenue === 0 ? "No sales recorded yet" : "Live revenue from sales history";
const restockSuggestions = lowStockCount;

return(

<div className="flex min-h-screen bg-[#fbf8f4]">

<Sidebar onLogout={onLogout}/>

<div className="flex-1">

<TopBar
  title="Dashboard"
  subtitle="Welcome back. Here's what's happening today."
/>

<div className="px-8 pb-10 pt-6">

<div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4 mb-8">

<StatsCard
title="Total Revenue (Month)"
value={`\u20B1${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
desc={revenueChange}
trend="up"
descClassName={totalRevenue === 0 ? "text-[#9a8b7d]" : "text-green-600"}
iconBg="bg-[#fff1e3]"
iconColor="text-[#ff7a1a]"
icon={
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
}
/>

<StatsCard
title="Total Inventory Items"
value={totalItems.toString()}
desc="Active tracked SKUs"
trend="neutral"
descClassName="text-[#9a8b7d]"
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
title="Low Stock Alerts"
value={lowStockCount.toString()}
desc="Items requiring attention"
trend="down"
descClassName="text-[#ff6a5a]"
iconBg="bg-[#ffeceb]"
iconColor="text-[#ff6a5a]"
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
title="AI Restock Suggestions"
value={restockSuggestions.toString()}
desc="Rule-based recommendations ready"
trend="neutral"
descClassName="text-[#9a8b7d]"
iconBg="bg-[#fff3e6]"
iconColor="text-[#c97a2b]"
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

<ForecastChart/>
<RestockList/>

</div>

</div>

</div>

</div>

)

}
