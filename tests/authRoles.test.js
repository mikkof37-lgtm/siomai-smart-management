import { describe, expect, test } from "vitest";
import {
  canAccessStaffSales,
  getUserDefaultBranch,
  getUserRole,
  isAdminOrOwner,
  isStaffMember
} from "../src/utils/authRoles.js";

describe("auth role helpers", () => {
  test("getUserRole normalizes metadata and trims whitespace", () => {
    expect(getUserRole({ app_metadata: { role: "  Admin  " } })).toBe("admin");
    expect(getUserRole({ user_metadata: { role: " Cashier " } })).toBe("cashier");
    expect(getUserRole({ role: "  OWNER " })).toBe("owner");
  });

  test("role helpers distinguish privileged and staff users", () => {
    const admin = { app_metadata: { role: "admin" } };
    const staff = { user_metadata: { role: "cashier" } };
    const guest = { user_metadata: { role: "visitor" } };

    expect(isAdminOrOwner(admin)).toBe(true);
    expect(isAdminOrOwner(staff)).toBe(false);
    expect(isStaffMember(staff)).toBe(true);
    expect(isStaffMember(guest)).toBe(true);
    expect(canAccessStaffSales(staff)).toBe(true);
    expect(canAccessStaffSales(admin)).toBe(true);
    expect(canAccessStaffSales(null)).toBe(false);
  });

  test("getUserDefaultBranch picks the first available branch field", () => {
    expect(
      getUserDefaultBranch({
        user_metadata: { branch: "  Main Branch  " },
        app_metadata: { default_branch: "Other" }
      })
    ).toBe("Main Branch");

    expect(
      getUserDefaultBranch({
        app_metadata: { default_branch: "  West Side " }
      })
    ).toBe("West Side");
  });
});
