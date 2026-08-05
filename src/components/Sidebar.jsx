import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { canAccessStaffSales, isAdminOrOwner } from "../utils/authRoles";

const SIDEBAR_COLLAPSED_KEY = "smart_inventory_sidebar_collapsed";

const navItems = [
  {
    label: "Dashboard",
    to: "/",
    allow: () => true,
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path
          d="M4 11h7V4H4v7Zm9 9h7v-7h-7v7ZM4 20h7v-7H4v7Zm9-9h7V4h-7v7Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    )
  },
  {
    label: "Staff Sales",
    to: "/staff-sales",
    allow: (user) => canAccessStaffSales(user),
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path
          d="M5 7h14v10H5z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M8 11h8M8 15h4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  },
  {
    label: "Inventory",
    to: "/inventory",
    allow: (user) => isAdminOrOwner(user),
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
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
    )
  },
  {
    label: "Sales History",
    to: "/sales",
    allow: (user) => isAdminOrOwner(user),
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path
          d="M4 15l6-6 4 4 6-6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M20 18H4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  },
  {
    label: "Restock Orders",
    to: "/restock",
    allow: (user) => isAdminOrOwner(user),
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path
          d="M12 4v4m0 8v4m-4-8h8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  },
  {
    label: "Demand Forecast",
    to: "/forecast",
    allow: (user) => isAdminOrOwner(user),
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path
          d="M4 19h16"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M7 16V9m5 7V6m5 10v-4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  },
  {
    label: "Team Access",
    to: "/team",
    allow: (user) => isAdminOrOwner(user),
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path
          d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M3.5 20a4.5 4.5 0 0 1 9 0M11.5 20a4.5 4.5 0 0 1 9 0"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }
];

export default function Sidebar({ currentUser }) {
  const [sessionUser, setSessionUser] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored ? stored === "1" : true;
  });
  const user = currentUser ?? sessionUser;

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

  const visibleNavItems = navItems.filter((item) => item.allow(user));
  const sidebarClassName = isCollapsed ? "w-20" : "w-56";
  const navLabelClassName = isCollapsed ? "max-w-0 opacity-0" : "max-w-[10rem] opacity-100";
  const navItemClassName = isCollapsed ? "justify-center px-0 mx-auto w-12" : "justify-start px-4";
  const navActiveClassName = isCollapsed
    ? "bg-[#3a261b] text-[#ff9a4a] ring-1 ring-[#ff7a1a]/20 shadow-[0_10px_30px_-18px_rgba(255,122,26,0.45)]"
    : "bg-[#3a261b] text-[#ff9a4a]";
  const navIdleClassName = "text-[#d1c3b6] hover:bg-[#2d1e16] hover:text-[#f5e5d7]";

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed ? "1" : "0");
  }, [isCollapsed]);

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r transition-[width] duration-200 ease-out ${sidebarClassName}`}
      style={{
        background: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
        color: "var(--sidebar-text)"
      }}
    >
      <div className={`relative border-b border-white/5 px-4 pt-5 ${isCollapsed ? "pb-6" : "pb-5"}`}>
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="absolute right-3 top-3 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#3a261b] bg-[#261a14] text-[#d1c3b6] transition hover:border-[#ff7a1a] hover:text-[#ff9a4a]"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={isCollapsed}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 transition-transform duration-200 ${
              isCollapsed ? "rotate-180" : ""
            }`}
            fill="none"
          >
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className={`flex items-center gap-3 overflow-hidden transition-all duration-200 ${isCollapsed ? "justify-center pt-8" : "w-auto opacity-100 pr-12"}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#ff7a1a] text-white shadow-lg shadow-orange-900/40">
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
          <div
            className={`overflow-hidden transition-all duration-200 ${
              isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
            }`}
          >
            <p className="text-sm font-semibold">Sio Republic</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">
              Smart Inventory
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-3 pb-6 pt-4">
        <nav className="h-full">
          <ul className={isCollapsed ? "space-y-3" : "space-y-2"}>
            {visibleNavItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  title={isCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    [
                      "group relative flex items-center gap-3 rounded-2xl py-3 text-sm font-medium transition",
                      navItemClassName,
                      isActive ? navActiveClassName : navIdleClassName
                    ].join(" ")
                  }
                >
                  <span className="text-[#ff9a4a]">{item.icon}</span>
                  <span
                    className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${navLabelClassName}`}
                    aria-hidden={isCollapsed}
                  >
                    {item.label}
                  </span>
                  {isCollapsed && (
                    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded-full border border-[var(--surface-border)] bg-[var(--surface-bg)] px-3 py-1 text-xs font-semibold text-[var(--app-text)] opacity-0 shadow-[0_12px_30px_-18px_rgba(58,41,29,0.55)] transition group-hover:opacity-100">
                      {item.label}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
