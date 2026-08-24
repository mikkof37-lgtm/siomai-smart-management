import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import NotificationBell from "./NotificationBell";
import { supabase } from "../lib/supabaseClient";
import { getUserRole } from "../utils/authRoles";

export default function TopBar({ title, subtitle, onLogout, currentUser }) {
  const [sessionUser, setSessionUser] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const user = currentUser ?? sessionUser;
  const isRichHeader = Boolean(title || subtitle);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
  const isMobileViewport = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};

      const mediaQuery = window.matchMedia("(max-width: 767px)");
      mediaQuery.addEventListener("change", onStoreChange);
      return () => mediaQuery.removeEventListener("change", onStoreChange);
    },
    () => (typeof window === "undefined" ? false : window.matchMedia("(max-width: 767px)").matches),
    () => false
  );

  useEffect(() => {
    if (currentUser) return undefined;

    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setSessionUser(data.user ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      data?.subscription?.unsubscribe();
    };
  }, [currentUser]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!accountMenuRef.current) return;
      if (accountMenuRef.current.contains(event.target)) return;
      setAccountMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    "Warehouse Admin";
  const displayRole = getUserRole(user) || "Staff";
  const avatarLetter = (displayName || "U").trim().charAt(0).toUpperCase();

  const accountButton = (
    <button
      type="button"
      onClick={() => setAccountMenuOpen((prev) => !prev)}
      className="inline-flex w-auto items-center gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-bg)] px-2.5 py-2 shadow-[0_14px_30px_-24px_rgba(58,41,29,0.45)] transition hover:border-[#ffb47b]"
      aria-expanded={accountMenuOpen}
      aria-haspopup="menu"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2d1d15] text-xs font-semibold text-[#ffb07a] ring-1 ring-[#f0dfcf] sm:h-10 sm:w-10 sm:text-sm">
        {avatarLetter}
      </div>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#9a8b7d] sm:h-4 sm:w-4" fill="none">
        <path
          d="M7 10l5 5 5-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  const mobileHeader = (
    <div className="flex items-center justify-between gap-3 rounded-[24px] border border-[var(--surface-border)] px-4 py-3 shadow-[var(--shadow-soft)]" style={{ background: "var(--panel-bg)" }}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-lg shadow-orange-900/25">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
            <path
              d="M4 10.5 12 5l8 5.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M8 20v-6h8v6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-[var(--app-text)]">
            {title || "Smart Inventory"}
          </h1>
          <p className="truncate text-[11px] uppercase tracking-[0.18em] text-[var(--surface-muted)]">
            {subtitle || today}
          </p>
        </div>
      </div>

      <div ref={accountMenuRef} className="flex items-center gap-2">
        <NotificationBell compact />
        <div className="relative">
          {accountButton}
          {accountMenuOpen && onLogout && (
            <div className="absolute right-0 top-full z-50 mt-3 w-[min(90vw,280px)] overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-bg)] shadow-[0_18px_50px_-24px_rgba(58,41,29,0.6)]">
              <div className="border-b border-[var(--surface-border)] px-4 py-3">
                <p className="text-sm font-semibold text-[var(--app-text)]">{displayName}</p>
                <p className="text-xs text-[var(--surface-muted)]">{displayRole}</p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-2 border-t border-[var(--surface-border)] px-4 py-3 text-left text-sm font-semibold text-[#6f5f52] transition hover:bg-[var(--accent-soft)] hover:text-[#ff7a1a]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                  <path
                    d="M14 7l5 5-5 5M19 12H9"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M5 4h6a2 2 0 0 1 2 2v3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M13 18v2a2 2 0 0 1-2 2H5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (isMobileViewport) {
    return <div className="px-4 pt-3 sm:px-6 lg:px-8 lg:pt-8">{mobileHeader}</div>;
  }

  return (
    <div className="px-4 pt-4 sm:px-6 lg:px-8 lg:pt-8">
      {isRichHeader ? (
        <div className="flex flex-col gap-4 rounded-[28px] border border-[var(--surface-border)] px-4 py-4 shadow-[var(--shadow-soft)] sm:px-5 sm:py-5 xl:flex-row xl:items-center xl:justify-between" style={{ background: "var(--panel-bg)" }}>
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-lg shadow-orange-900/25 sm:h-12 sm:w-12">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                <path
                  d="M4 10.5 12 5l8 5.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 20v-6h8v6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b85d11]">
                Sio Republic
              </div>
              <h1 className="text-xl font-semibold text-[var(--app-text)] sm:text-2xl">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--surface-muted)]">{subtitle}</p>
            </div>
          </div>

          <div ref={accountMenuRef} className="flex flex-col items-end gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-bg)] px-4 py-2 text-left shadow-[0_14px_30px_-24px_rgba(58,41,29,0.35)] md:block">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                Today
              </div>
              <div className="text-sm font-medium text-[var(--app-text)]">{today}</div>
            </div>
            <NotificationBell />
            <div className="relative">
              {accountButton}
              {accountMenuOpen && onLogout && (
                <div className="absolute right-0 top-full z-50 mt-3 w-64 overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-bg)] shadow-[0_18px_50px_-24px_rgba(58,41,29,0.6)]">
                  <div className="border-b border-[var(--surface-border)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--app-text)]">{displayName}</p>
                    <p className="text-xs text-[var(--surface-muted)]">{displayRole}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 border-t border-[var(--surface-border)] px-4 py-3 text-left text-sm font-semibold text-[#6f5f52] transition hover:bg-[var(--accent-soft)] hover:text-[#ff7a1a]"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                      <path
                        d="M14 7l5 5-5 5M19 12H9"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M5 4h6a2 2 0 0 1 2 2v3"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                      <path
                        d="M13 18v2a2 2 0 0 1-2 2H5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-[28px] border border-[var(--surface-border)] px-4 py-4 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center sm:justify-between sm:px-5" style={{ background: "var(--panel-bg)" }}>
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-lg shadow-orange-900/25">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                <path
                  d="M4 10.5 12 5l8 5.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 20v-6h8v6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b85d11]">
                Sio Republic
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[var(--app-text)]">Smart Inventory</p>
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--surface-muted)]">
                  {today}
                </span>
              </div>
            </div>
          </div>

          <div ref={accountMenuRef} className="flex flex-col items-end gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <NotificationBell />
            <div className="relative">
              {accountButton}
              {accountMenuOpen && onLogout && (
                <div className="absolute right-0 top-full z-50 mt-3 w-64 overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-bg)] shadow-[0_18px_50px_-24px_rgba(58,41,29,0.6)]">
                  <div className="border-b border-[var(--surface-border)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--app-text)]">{displayName}</p>
                    <p className="text-xs text-[var(--surface-muted)]">{displayRole}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 border-t border-[var(--surface-border)] px-4 py-3 text-left text-sm font-semibold text-[#6f5f52] transition hover:bg-[var(--accent-soft)] hover:text-[#ff7a1a]"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                      <path
                        d="M14 7l5 5-5 5M19 12H9"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M5 4h6a2 2 0 0 1 2 2v3"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                      <path
                        d="M13 18v2a2 2 0 0 1-2 2H5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
