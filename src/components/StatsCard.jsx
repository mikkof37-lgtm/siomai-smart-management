export default function StatsCard({
  title,
  value,
  desc,
  icon,
  trend = "up",
  iconBg = "bg-[#f7efe6]",
  iconColor = "text-[#a05a2c]",
  valueClassName = "text-[#231a12]",
  descClassName
}) {
  const trendClass = descClassName
    ? descClassName
    : trend === "up"
      ? "text-green-600"
      : trend === "down"
        ? "text-red-600"
        : "text-gray-500";

  return (
    <div className="bg-white p-5 rounded-2xl border border-[#efe6dc] shadow-[0_12px_30px_-24px_rgba(52,33,20,0.6)]">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[#8c7b6d] text-sm">{title}</h3>
          <p className={`text-2xl font-semibold mt-2 ${valueClassName}`}>{value}</p>
          <p className={`text-sm mt-1 ${trendClass}`}>{desc}</p>
        </div>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${iconBg} ${iconColor}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
