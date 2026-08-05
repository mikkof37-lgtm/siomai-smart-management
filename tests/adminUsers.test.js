import { describe, expect, test, vi, beforeEach } from "vitest";

function createResponseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe("admin users endpoint", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  });

  test("rejects requests without an authorization token", async () => {
    const { default: handler } = await import("../api/admin-users.js");
    const res = createResponseMock();

    await handler({ method: "GET", headers: {}, url: "/api/admin-users" }, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/authorization token required/i);
  });

  test("returns users for authenticated admins", async () => {
    const anonUser = {
      id: "admin-1",
      email: "owner@example.com",
      app_metadata: { role: "owner", default_branch: "Talavera 2" },
      user_metadata: { full_name: "Owner One" }
    };
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        users: [
          {
            id: "user-1",
            email: "staff@example.com",
            app_metadata: { role: "staff", default_branch: "Aliaga" },
            user_metadata: { full_name: "Staff One" },
            created_at: "2026-08-01T00:00:00Z"
          }
        ],
        page: 1,
        perPage: 50,
        total: 1
      },
      error: null
    });
    const createClient = vi.fn((url, key) => {
      if (key === "service-role-key") {
        return {
          auth: {
            admin: {
              listUsers
            }
          }
        };
      }

      return {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: anonUser }, error: null })
        }
      };
    });

    vi.doMock("@supabase/supabase-js", () => ({ createClient }));

    const { default: handler } = await import("../api/admin-users.js");
    const res = createResponseMock();

    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer valid-token" },
        url: "/api/admin-users?page=1&perPage=50"
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].role).toBe("staff");
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 50 });
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  test("updates a user's role and branch", async () => {
    const anonUser = {
      id: "admin-1",
      email: "owner@example.com",
      app_metadata: { role: "admin", default_branch: "Talavera 2" },
      user_metadata: { full_name: "Owner One" }
    };
    const targetUser = {
      id: "user-2",
      email: "staff@example.com",
      app_metadata: { role: "staff", default_branch: "Baloc" },
      user_metadata: { full_name: "Staff One" }
    };
    const updatedUser = {
      ...targetUser,
      app_metadata: { role: "staff", default_branch: "Aliaga", branch: "Aliaga" },
      user_metadata: { full_name: "Staff One", role: "staff", default_branch: "Aliaga", branch: "Aliaga" }
    };
    const getUserById = vi.fn().mockResolvedValue({ data: { user: targetUser }, error: null });
    const updateUserById = vi.fn().mockResolvedValue({ data: { user: updatedUser }, error: null });
    const createClient = vi.fn((url, key) => {
      if (key === "service-role-key") {
        return {
          auth: {
            admin: {
              getUserById,
              updateUserById
            }
          }
        };
      }

      return {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: anonUser }, error: null })
        }
      };
    });

    vi.doMock("@supabase/supabase-js", () => ({ createClient }));

    const { default: handler } = await import("../api/admin-users.js");
    const res = createResponseMock();

    await handler(
      {
        method: "PATCH",
        headers: { authorization: "Bearer valid-token" },
        url: "/api/admin-users",
        body: {
          userId: "user-2",
          fullName: "Staff One",
          role: "staff",
          defaultBranch: "Aliaga"
        }
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.user.role).toBe("staff");
    expect(res.body.user.defaultBranch).toBe("Aliaga");
    expect(updateUserById).toHaveBeenCalledWith(
      "user-2",
      expect.objectContaining({
        app_metadata: expect.objectContaining({ role: "staff", default_branch: "Aliaga" }),
        user_metadata: expect.objectContaining({
          full_name: "Staff One",
          name: "Staff One",
          role: "staff",
          default_branch: "Aliaga"
        })
      })
    );
  });
});
