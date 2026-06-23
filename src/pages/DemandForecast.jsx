import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";

export default function DemandForecast({ onLogout }) {
  return (
    <div className="flex min-h-screen bg-[#fbf8f4]">
      <Sidebar onLogout={onLogout} />
      <div className="flex-1">
        <TopBar/>
        <div className="px-8 pb-10 pt-6">
          <h1 className="text-2xl font-semibold text-[#2b2018] mb-2">
            Demand Forecast
          </h1>
          <p className="text-sm text-[#8c7b6d]">
            This page is ready for your forecast details.
          </p>
        </div>
      </div>
    </div>
  );
}
