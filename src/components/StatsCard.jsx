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
    <div className="rounded-[24px] border border-[var(--surface-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,251,247,0.92)_100%)] p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
            {title}
          </h3>
          <p className={`mt-2 text-[1.65rem] font-semibold leading-none ${valueClassName}`}>{value}</p>
          <p className={`mt-2 text-sm ${trendClass}`}>{desc}</p>
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--surface-border)] ${iconBg} ${iconColor}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
