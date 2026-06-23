import NotificationBell from "./NotificationBell";

export default function TopBar({ title, subtitle }) {
  const isRichHeader = Boolean(title || subtitle);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  return (
    <div className={isRichHeader ? "px-8 pt-8" : "flex items-center justify-end px-8 pt-8"}>
      {isRichHeader ? (
        <div className="flex flex-col gap-4 rounded-[28px] border border-[#efe6dc] bg-[linear-gradient(135deg,#ffffff_0%,#fff8f1_48%,#fff1e3_100%)] px-6 py-5 shadow-[0_20px_60px_-35px_rgba(58,41,29,0.55)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#fff1e3] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c96f15]">
              Warehouse overview
            </div>
            <h1 className="text-2xl font-semibold text-[#2b2018]">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#8c7b6d]">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden rounded-2xl border border-[#efe6dc] bg-white px-4 py-2 text-left shadow-sm md:block">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a8b7d]">
                Today
              </div>
              <div className="text-sm font-medium text-[#2b2018]">{today}</div>
            </div>
            <NotificationBell />
          </div>
        </div>
      ) : (
        <NotificationBell />
      )}
    </div>
  );
}
