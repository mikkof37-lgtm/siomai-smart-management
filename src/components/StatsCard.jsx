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
    <div className="rounded-[24px] border border-[var(--surface-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,251,247,0.92)_100%)] p-4 shadow-[var(--shadow-soft)] sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--surface-muted)] sm:text-[11px] sm:tracking-[0.18em]">
            {title}
          </h3>
          <p className={`mt-2 text-[1.2rem] font-semibold leading-none sm:text-[1.65rem] ${valueClassName}`}>{value}</p>
          <p className={`mt-1 text-xs sm:mt-2 sm:text-sm ${trendClass}`}>{desc}</p>
        </div>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--surface-border)] ${iconBg} ${iconColor} sm:h-11 sm:w-11 sm:rounded-2xl`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
