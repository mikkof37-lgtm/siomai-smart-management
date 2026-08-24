import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { canAccessStaffSales, isAdminOrOwner } from "../utils/authRoles";

const routeIcons = {
  dashboard: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M4 11h7V4H4v7Zm9 9h7v-7h-7v7ZM4 20h7v-7H4v7Zm9-9h7V4h-7v7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  staffSales: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M5 7h14v10H5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M8 11h8M8 15h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  inventory: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M4 7 12 3l8 4-8 4-8-4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M4 7v10l8 4 8-4V7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  sales: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M4 15l6-6 4 4 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 18H4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  queue: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M7 13a5 5 0 0 1 9.5-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M17 11a4 4 0 1 1 0 8H8a4 4 0 1 1 0-8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 12v5m0 0-2-2m2 2 2-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  restock: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M12 4v4m0 8v4m-4-8h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  audit: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M7 4h8l4 4v12H7z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M15 4v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 12h5M10 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
};

export default function MobileNav({ currentUser, onLogout }) {
  const [open, setOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState(null);
  const menuRef = useRef(null);
  const user = currentUser ?? sessionUser;
  const isAdmin = isAdminOrOwner(user);
  const canStaff = canAccessStaffSales(user);

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

  const primaryRoutes = useMemo(() => {
    if (isAdmin) {
      return [
        { key: "dashboard", label: "Home", to: "/" },
        { key: "staffSales", label: "Staff", to: "/staff-sales" },
        { key: "inventory", label: "Inv", to: "/inventory" },
        { key: "sales", label: "Sales", to: "/sales" },
        { key: "audit", label: "Audit", to: "/audit-logs" }
      ];
    }

    if (canStaff) {
      return [
        { key: "dashboard", label: "Home", to: "/" },
        { key: "staffSales", label: "Staff", to: "/staff-sales" }
      ];
    }

    return [{ key: "dashboard", label: "Home", to: "/" }];
  }, [canStaff, isAdmin]);

  const moreRoutes = useMemo(() => {
    const routes = [];

    if (isAdmin) {
      routes.push(
        { key: "restock", label: "Restock Orders", to: "/restock" },
        { key: "forecast", label: "Demand Forecast", to: "/forecast" },
        { key: "team", label: "Team Access", to: "/team" }
      );
    }

    return routes;
  }, [isAdmin]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(timer);
  }, [currentUser]);

  if (!primaryRoutes.length) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div className="px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div
          ref={menuRef}
          className="relative overflow-visible rounded-[28px] border border-[var(--surface-border)] bg-[linear-gradient(180deg,rgba(255,253,251,0.98)_0%,rgba(245,237,229,0.98)_100%)] px-3 py-2 shadow-[0_-12px_40px_-20px_rgba(58,41,29,0.2)] backdrop-blur"
        >
          <div className="flex items-stretch justify-between gap-2">
            {primaryRoutes.map((route) => (
              <NavLink
                key={route.to}
                to={route.to}
                end={route.to === "/"}
                className={({ isActive }) =>
                  [
                    "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition",
                    isActive
                      ? "bg-[var(--accent-soft)] text-[#c96f15] shadow-[0_10px_24px_-18px_rgba(255,122,26,0.22)]"
                      : "text-[#6f5f52] hover:bg-[#fff1e3] hover:text-[#c96f15]"
                  ].join(" ")
                }
                aria-label={route.label}
              >
                <span className="text-[#ff7a1a]">{routeIcons[route.key]}</span>
                <span className="truncate leading-none">{route.label}</span>
              </NavLink>
            ))}

            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold text-[#6f5f52] transition hover:bg-[#fff1e3] hover:text-[#c96f15]"
              aria-expanded={open}
              aria-haspopup="menu"
              aria-label="More options"
            >
              <span className="text-[#ff7a1a]">{routeIcons.more}</span>
              <span className="truncate leading-none">More</span>
            </button>
          </div>

          {open && (
            <div className="absolute inset-x-3 bottom-full mb-3 overflow-hidden rounded-[24px] border border-[var(--surface-border)] bg-[var(--surface-bg)] shadow-[0_18px_50px_-24px_rgba(58,41,29,0.6)]">
              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--surface-muted)]">
                  More
                </p>
              </div>

              <div className="border-t border-[var(--surface-border)]">
                {moreRoutes.length > 0 ? (
                  moreRoutes.map((route) => (
                    <NavLink
                      key={route.to}
                      to={route.to}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--app-text)] transition hover:bg-[#fff8f1] hover:text-[#ff7a1a]"
                      onClick={() => setOpen(false)}
                    >
                      <span className="text-[#ff7a1a]">{routeIcons[route.key]}</span>
                      <span>{route.label}</span>
                    </NavLink>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-[var(--surface-muted)]">
                    No additional pages.
                  </div>
                )}
              </div>

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center justify-between border-t border-[var(--surface-border)] px-4 py-3 text-left text-sm font-semibold text-[#6f5f52] transition hover:bg-[#fff8f1] hover:text-[#ff7a1a]"
                >
                  <span>Logout</span>
                  <span className="text-xs text-[var(--surface-muted)]">Sign out</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
