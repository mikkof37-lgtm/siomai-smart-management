import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { InventoryProvider } from "./context/InventoryContext";
import { SettingsProvider } from "./context/SettingsContext";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import SalesHistory from "./pages/SalesHistory";
import StaffSales from "./pages/StaffSales";
import RestockOrders from "./pages/RestockOrders";
import DemandForecast from "./pages/DemandForecast";
import TeamAccess from "./pages/TeamAccess";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import { supabase } from "./lib/supabaseClient";
import { SalesProvider } from "./context/SalesContext";
import { canAccessStaffSales, isAdminOrOwner } from "./utils/authRoles";
import AppErrorBoundary from "./components/AppErrorBoundary";

export function AppShell() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showLoginToast, setShowLoginToast] = useState(false);
  const [toastEntered, setToastEntered] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleLogin = () => {
    setShowLoginToast(true);
    setToastEntered(false);
  };

  const handleLogout = () => {
    supabase.auth.signOut();
  };

  useEffect(() => {
    if (!showLoginToast) return;
    const enterTimer = setTimeout(() => {
      setToastEntered(true);
    }, 20);
    const timer = setTimeout(() => {
      setShowLoginToast(false);
    }, 3000);
    return () => {
      clearTimeout(timer);
      clearTimeout(enterTimer);
    };
  }, [showLoginToast]);

  useEffect(() => {
    let isMounted = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          setAuthError(error.message || "Auth could not be initialized.");
        }
        setIsAuthed(Boolean(data?.session));
        setCurrentUser(data?.session?.user ?? null);
        setIsAuthReady(true);
      })
      .catch((error) => {
        if (!isMounted) return;
        setAuthError(error?.message || "Auth could not be initialized.");
        setIsAuthed(false);
        setCurrentUser(null);
        setIsAuthReady(true);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(Boolean(session));
      setCurrentUser(session?.user ?? null);
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const shouldShow = sessionStorage.getItem("login_toast") === "1";
    if (isAuthed && shouldShow) {
      const timer = setTimeout(() => {
        handleLogin();
        sessionStorage.removeItem("login_toast");
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [isAuthed]);

  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-6">
        <div className="max-w-md rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-bg)] p-6 text-center shadow-[0_18px_60px_-30px_rgba(58,41,29,0.45)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff7a1a] text-white">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
              <path
                d="M4 10.5 12 5l8 5.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-lg font-semibold text-[var(--app-text)]">Loading Smart Inventory</p>
          <p className="mt-2 text-sm text-[var(--surface-muted)]">Connecting to your account...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {authError && (
        <div className="fixed left-1/2 top-4 z-50 w-[min(92vw,720px)] -translate-x-1/2">
          <div className="rounded-2xl border border-[#ffd5d0] bg-[#fff4f2] px-5 py-4 text-sm text-[#b0483b] shadow-[0_18px_50px_-25px_rgba(176,72,59,0.35)]">
            <div className="font-semibold">Auth warning</div>
            <div className="mt-1">{authError}</div>
          </div>
        </div>
      )}
      <Routes>
        <Route path="*" element={<Navigate to={isAuthed ? "/" : "/login"} replace />} />
        <Route
          path="/login"
          element={isAuthed ? <Navigate to="/" replace /> : <Login />}
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/"
          element={
            isAuthed ? (
              <Dashboard onLogout={handleLogout} currentUser={currentUser} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/inventory"
          element={
            isAuthed && isAdminOrOwner(currentUser) ? (
              <Inventory onLogout={handleLogout} currentUser={currentUser} />
            ) : (
              <Navigate to={isAuthed ? "/" : "/login"} replace />
            )
          }
        />
        <Route
          path="/staff-sales"
          element={
            isAuthed && canAccessStaffSales(currentUser) ? (
              <StaffSales onLogout={handleLogout} currentUser={currentUser} />
            ) : (
              <Navigate to={isAuthed ? "/" : "/login"} replace />
            )
          }
        />
        <Route
          path="/sales"
          element={
            isAuthed && isAdminOrOwner(currentUser) ? (
              <SalesHistory onLogout={handleLogout} currentUser={currentUser} />
            ) : (
              <Navigate to={isAuthed ? "/" : "/login"} replace />
            )
          }
        />
        <Route
          path="/restock"
          element={
            isAuthed && isAdminOrOwner(currentUser) ? (
              <RestockOrders onLogout={handleLogout} currentUser={currentUser} />
            ) : (
              <Navigate to={isAuthed ? "/" : "/login"} replace />
            )
          }
        />
        <Route
          path="/forecast"
          element={
            isAuthed && isAdminOrOwner(currentUser) ? (
              <DemandForecast onLogout={handleLogout} currentUser={currentUser} />
            ) : (
              <Navigate to={isAuthed ? "/" : "/login"} replace />
            )
          }
        />
        <Route
          path="/team"
          element={
            isAuthed && isAdminOrOwner(currentUser) ? (
              <TeamAccess onLogout={handleLogout} currentUser={currentUser} />
            ) : (
              <Navigate to={isAuthed ? "/" : "/login"} replace />
            )
          }
        />
      </Routes>
      {showLoginToast && (
        <div className="fixed top-6 right-6 z-50 w-[320px]">
          <div
            className={[
              "flex items-center justify-between gap-4 rounded-2xl border border-[#efe6dc] bg-white px-5 py-4 shadow-[0_18px_50px_-25px_rgba(58,41,29,0.6)]",
              "transition-all duration-300 ease-out",
              toastEntered ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-3 scale-95"
            ].join(" ")}
          >
            <div>
              <p className="text-sm font-semibold text-[#2b2018]">Login Successfully</p>
              <p className="text-xs text-[#8c7b6d]">Welcome back.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowLoginToast(false)}
              className="rounded-full bg-[#efebe6] px-3 py-1 text-[11px] font-semibold text-[#6f5f52] hover:bg-[#e5ddd4]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <SettingsProvider>
        <InventoryProvider>
          <SalesProvider>
            <BrowserRouter>
              <AppShell />
            </BrowserRouter>
          </SalesProvider>
        </InventoryProvider>
      </SettingsProvider>
    </AppErrorBoundary>
  );
}

export default App;
