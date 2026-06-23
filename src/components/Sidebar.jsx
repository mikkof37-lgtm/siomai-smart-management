import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { getUserRole } from "../utils/authRoles";

const navItems = [
  {
    label: "Dashboard",
    to: "/",
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
    label: "Inventory",
    to: "/inventory",
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
    label: "AI Restocking",
    to: "/restock",
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
  }
];

export default function Sidebar({ onLogout }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setUser(data.user ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    "Warehouse Admin";
  const displayRole = getUserRole(user) || "Admin";
  const avatarLetter = (displayName || "U").trim().charAt(0).toUpperCase();

  return (
    <aside className="flex min-h-screen w-64 flex-col justify-between bg-[#221813] text-[#f7f1ea]">
      <div>
        <div className="flex items-center gap-3 px-6 py-6">
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
          <div>
            <p className="text-sm font-semibold">Sio Republic</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#a89788]">
              Smart Inventory
            </p>
          </div>
        </div>

        <nav className="px-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition",
                      isActive
                        ? "bg-[#3a261b] text-[#ff9a4a]"
                        : "text-[#d1c3b6] hover:bg-[#2d1e16] hover:text-[#f5e5d7]"
                    ].join(" ")
                  }
                >
                  <span className="text-[#ff9a4a]">{item.icon}</span>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="px-4 pb-6">
        <div className="rounded-2xl border border-[#3a261b] bg-[#261a14] p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3a251a] text-sm font-semibold text-[#ffb07a] ring-1 ring-[#4b3224]">
              {avatarLetter}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#f5e9df]">{displayName}</p>
              <p className="text-xs text-[#a89788]">{displayRole}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#d1c3b6] transition hover:bg-[#2d1e16] hover:text-[#ff9a4a]"
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
    </aside>
  );
}
