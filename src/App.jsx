import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { InventoryProvider } from "./context/InventoryContext";
import { SettingsProvider } from "./context/SettingsContext";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import SalesHistory from "./pages/SalesHistory";
import RestockOrders from "./pages/RestockOrders";
import DemandForecast from "./pages/DemandForecast";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import { supabase } from "./lib/supabaseClient";
import { SalesProvider } from "./context/SalesContext";

function AppShell() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showLoginToast, setShowLoginToast] = useState(false);
  const [toastEntered, setToastEntered] = useState(false);

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
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setIsAuthed(Boolean(data.session));
      setCurrentUser(data.session?.user ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthed(Boolean(session));
      setCurrentUser(session?.user ?? null);
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

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={isAuthed ? <Navigate to="/" replace /> : <Login />}
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/"
          element={isAuthed ? <Dashboard onLogout={handleLogout} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/inventory"
          element={isAuthed ? <Inventory onLogout={handleLogout} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/sales"
          element={
            isAuthed ? (
              <SalesHistory onLogout={handleLogout} currentUser={currentUser} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/restock"
          element={isAuthed ? <RestockOrders onLogout={handleLogout} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/forecast"
          element={isAuthed ? <DemandForecast onLogout={handleLogout} /> : <Navigate to="/login" replace />}
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
    <SettingsProvider>
      <InventoryProvider>
        <SalesProvider>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </SalesProvider>
      </InventoryProvider>
    </SettingsProvider>
  );
}

export default App;
