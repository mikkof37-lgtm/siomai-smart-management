import { useEffect, useRef, useState } from "react";
import NotificationBell from "./NotificationBell";
import { supabase } from "../lib/supabaseClient";
import { getUserRole } from "../utils/authRoles";

const THEME_STORAGE_KEY = "smart_inventory_theme";

export default function TopBar({ title, subtitle, onLogout, currentUser }) {
  const [sessionUser, setSessionUser] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem(THEME_STORAGE_KEY) || "light";
  });
  const accountMenuRef = useRef(null);
  const user = currentUser ?? sessionUser;
  const isRichHeader = Boolean(title || subtitle);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

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
      className="flex items-center gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-bg)] px-3 py-2 shadow-sm transition hover:border-[#ffb47b]"
      aria-expanded={accountMenuOpen}
      aria-haspopup="menu"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3a251a] text-sm font-semibold text-[#ffb07a] ring-1 ring-[#f0dfcf]">
        {avatarLetter}
      </div>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#9a8b7d]" fill="none">
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

  return (
    <div className={isRichHeader ? "px-8 pt-8" : "px-8 pt-8"}>
      {isRichHeader ? (
        <div className="flex flex-col gap-4 rounded-[28px] border border-[var(--surface-border)] bg-[var(--surface-bg)] px-6 py-5 shadow-[0_20px_60px_-35px_rgba(58,41,29,0.55)] xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ff7a1a] text-white shadow-lg shadow-orange-900/40">
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
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#fff1e3] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c96f15]">
                Sio Republic
              </div>
              <h1 className="text-2xl font-semibold text-[var(--app-text)]">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--surface-muted)]">{subtitle}</p>
            </div>
          </div>

          <div ref={accountMenuRef} className="flex flex-wrap items-center gap-3">
            <div className="hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-bg)] px-4 py-2 text-left shadow-sm md:block">
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
                  <div className="px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                      Appearance
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTheme("light")}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          theme === "light"
                            ? "border-[#ff7a1a] bg-[#fff1e3] text-[#c96f15]"
                            : "border-[var(--surface-border)] bg-white text-[var(--app-text)] hover:border-[#ffb47b]"
                        }`}
                      >
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme("dark")}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          theme === "dark"
                            ? "border-[#ff7a1a] bg-[#3a261b] text-[#ffb07a]"
                            : "border-[var(--surface-border)] bg-white text-[var(--app-text)] hover:border-[#ffb47b]"
                        }`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 border-t border-[var(--surface-border)] px-4 py-3 text-left text-sm font-semibold text-[#6f5f52] transition hover:bg-[#fff8f1] hover:text-[#ff7a1a]"
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-[var(--surface-border)] bg-[var(--surface-bg)] px-6 py-4 shadow-[0_20px_60px_-35px_rgba(58,41,29,0.45)]">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#ff7a1a] text-white shadow-lg shadow-orange-900/40">
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
              <div className="inline-flex items-center gap-2 rounded-full bg-[#fff1e3] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c96f15]">
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

          <div ref={accountMenuRef} className="flex flex-wrap items-center gap-3">
            <NotificationBell />
            <div className="relative">
              {accountButton}
              {accountMenuOpen && onLogout && (
                <div className="absolute right-0 top-full z-50 mt-3 w-64 overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-bg)] shadow-[0_18px_50px_-24px_rgba(58,41,29,0.6)]">
                  <div className="border-b border-[var(--surface-border)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--app-text)]">{displayName}</p>
                    <p className="text-xs text-[var(--surface-muted)]">{displayRole}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                      Appearance
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTheme("light")}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          theme === "light"
                            ? "border-[#ff7a1a] bg-[#fff1e3] text-[#c96f15]"
                            : "border-[var(--surface-border)] bg-white text-[var(--app-text)] hover:border-[#ffb47b]"
                        }`}
                      >
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme("dark")}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          theme === "dark"
                            ? "border-[#ff7a1a] bg-[#3a261b] text-[#ffb07a]"
                            : "border-[var(--surface-border)] bg-white text-[var(--app-text)] hover:border-[#ffb47b]"
                        }`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 border-t border-[var(--surface-border)] px-4 py-3 text-left text-sm font-semibold text-[#6f5f52] transition hover:bg-[#fff8f1] hover:text-[#ff7a1a]"
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
