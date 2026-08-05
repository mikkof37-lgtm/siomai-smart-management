import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = vi.hoisted(() => ({
  session: null,
  user: null
}));

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: authState.session } })),
  onAuthStateChange: vi.fn((callback) => {
    callback("INITIAL_SESSION", authState.session);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }),
  signOut: vi.fn(),
  getUser: vi.fn(async () => ({ data: { user: authState.user } }))
}));

vi.mock("../src/lib/supabaseClient", () => ({
  supabase: {
    auth: authMock
  }
}));

vi.mock("../src/utils/authRoles", () => ({
  canAccessStaffSales: (user) =>
    Boolean(user?.user_metadata?.role === "cashier" || user?.app_metadata?.role === "admin"),
  isAdminOrOwner: (user) => Boolean(user?.app_metadata?.role === "admin")
}));

vi.mock("../src/context/SettingsContext", () => ({
  SettingsProvider: ({ children }) => <>{children}</>
}));

vi.mock("../src/context/InventoryContext", () => ({
  InventoryProvider: ({ children }) => <>{children}</>
}));

vi.mock("../src/context/SalesContext", () => ({
  SalesProvider: ({ children }) => <>{children}</>
}));

vi.mock("../src/pages/Dashboard", () => ({
  default: () => <div>Dashboard page</div>
}));

vi.mock("../src/pages/Inventory", () => ({
  default: () => <div>Inventory page</div>
}));

vi.mock("../src/pages/SalesHistory", () => ({
  default: () => <div>Sales history page</div>
}));

vi.mock("../src/pages/StaffSales", () => ({
  default: () => <div>Staff sales page</div>
}));

vi.mock("../src/pages/RestockOrders", () => ({
  default: () => <div>Restock orders page</div>
}));

vi.mock("../src/pages/DemandForecast", () => ({
  default: () => <div>Demand forecast page</div>
}));

vi.mock("../src/pages/Login", () => ({
  default: () => <div>Login page</div>
}));

vi.mock("../src/pages/ResetPassword", () => ({
  default: () => <div>Reset password page</div>
}));

import { AppShell } from "../src/App";

beforeEach(() => {
  authState.session = null;
  authState.user = null;
  authMock.getSession.mockClear();
  authMock.onAuthStateChange.mockClear();
  authMock.signOut.mockClear();
  authMock.getUser.mockClear();
});

describe("app routing", () => {
  test("redirects unauthenticated users to login", async () => {
    render(
      <MemoryRouter initialEntries={["/inventory"]}>
        <AppShell />
      </MemoryRouter>
    );

    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });

  test("shows the dashboard for an authenticated user", async () => {
    authState.session = {
      user: {
        email: "admin@example.com",
        app_metadata: { role: "admin" }
      }
    };
    authState.user = authState.session.user;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>
    );

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });

  test("allows staff users into the staff sales route", async () => {
    authState.session = {
      user: {
        email: "staff@example.com",
        user_metadata: { role: "cashier" }
      }
    };
    authState.user = authState.session.user;

    render(
      <MemoryRouter initialEntries={["/staff-sales"]}>
        <AppShell />
      </MemoryRouter>
    );

    expect(await screen.findByText("Staff sales page")).toBeInTheDocument();
  });
});
