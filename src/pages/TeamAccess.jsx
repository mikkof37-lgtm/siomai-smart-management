import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { BRANCH_OPTIONS } from "../data/branches";
import { supabase } from "../lib/supabaseClient";
import { getUserDefaultBranch, getUserRole, isAdminOrOwner } from "../utils/authRoles";

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" }
];

const ROLE_LABELS = ROLE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

const emptyForm = {
  userId: "",
  fullName: "",
  role: "staff",
  defaultBranch: ""
};

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function branchLabel(value) {
  const branch = BRANCH_OPTIONS.find((option) => option.value === value);
  return branch?.label || value || "Unassigned";
}

function normalizeUser(user) {
  return {
    id: user.id,
    email: user.email || "",
    fullName: user.fullName || "",
    role: user.role || "staff",
    defaultBranch: user.defaultBranch || "",
    emailConfirmedAt: user.emailConfirmedAt || "",
    lastSignInAt: user.lastSignInAt || "",
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || "",
    appMetadata: user.appMetadata || {},
    userMetadata: user.userMetadata || {}
  };
}

export default function TeamAccess({ onLogout, currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const canManage = isAdminOrOwner(currentUser);
  const currentRole = getUserRole(currentUser) || "staff";
  const currentBranch = getUserDefaultBranch(currentUser) || "Unassigned";

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aName = (a.fullName || a.email || "").toLowerCase();
      const bName = (b.fullName || b.email || "").toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [users]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error("Unable to read the current session.");
      }

      const response = await fetch("/api/admin-users", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || data?.detail || "Failed to load users.");
      }

      setUsers((Array.isArray(data.users) ? data.users : []).map(normalizeUser));
    } catch (requestError) {
      setError(requestError?.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage) return;
    void loadUsers();
  }, [canManage, loadUsers]);

  const resetForm = () => {
    setForm(emptyForm);
    setMessage("");
    setError("");
  };

  const beginEdit = (user) => {
    setForm({
      userId: user.id,
      fullName: user.fullName || "",
      role: user.role || "staff",
      defaultBranch: user.defaultBranch || ""
    });
    setMessage("");
    setError("");
  };

  const saveUser = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSavingUserId(form.userId);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error("Unable to read the current session.");
      }

      const response = await fetch("/api/admin-users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: form.userId,
          fullName: form.fullName,
          role: form.role,
          defaultBranch: form.defaultBranch
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || data?.detail || "User update failed.");
      }

      const nextUser = normalizeUser(data.user);
      setUsers((current) => current.map((user) => (user.id === nextUser.id ? nextUser : user)));
      setMessage(`Updated ${nextUser.email || nextUser.id}.`);
      setForm((prev) => ({
        ...prev,
        userId: nextUser.id,
        fullName: nextUser.fullName,
        role: nextUser.role,
        defaultBranch: nextUser.defaultBranch
      }));
    } catch (requestError) {
      setError(requestError?.message || "User update failed.");
    } finally {
      setSavingUserId("");
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[var(--app-bg)]">
      <Sidebar currentUser={currentUser} />
      <div className="flex-1">
        <TopBar
          title="Team Access"
          subtitle="Manage user roles and default branches from one place."
          onLogout={onLogout}
          currentUser={currentUser}
        />

        <div className="px-8 pb-10 pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <p className="text-sm text-[#8c7b6d]">Current role</p>
              <p className="mt-2 text-2xl font-semibold text-[#2b2018]">{ROLE_LABELS[currentRole] || currentRole}</p>
            </div>
            <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <p className="text-sm text-[#8c7b6d]">Current branch</p>
              <p className="mt-2 text-2xl font-semibold text-[#2b2018]">{branchLabel(currentBranch)}</p>
            </div>
            <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <p className="text-sm text-[#8c7b6d]">Managed users</p>
              <p className="mt-2 text-2xl font-semibold text-[#2b2018]">{users.length}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-[#2b2018]">Users</h1>
                  <p className="mt-1 text-sm text-[#8c7b6d]">
                    These values are stored in Supabase auth metadata so role and branch changes
                    survive across devices and sessions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadUsers()}
                  className="rounded-full border border-[#efe6dc] px-4 py-2 text-sm font-semibold text-[#6f5f52] transition hover:border-[#ffb47b] hover:text-[#c96f15]"
                >
                  Refresh
                </button>
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-[#ffd5d0] bg-[#fff4f2] px-4 py-3 text-sm text-[#b0483b]">
                  {error}
                </div>
              )}
              {message && (
                <div className="mt-4 rounded-xl border border-[#d8f2e4] bg-[#f1fbf5] px-4 py-3 text-sm text-[#20734a]">
                  {message}
                </div>
              )}

              <div className="mt-6 overflow-hidden rounded-2xl border border-[#efe6dc]">
                <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr_120px] gap-3 border-b border-[#f2eae0] bg-[#fffaf5] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#9a8b7d]">
                  <div>User</div>
                  <div>Role</div>
                  <div>Branch</div>
                  <div>Last sign-in</div>
                  <div className="text-right">Action</div>
                </div>

                <div className="divide-y divide-[#f4ede4]">
                  {loading ? (
                    <div className="px-4 py-8 text-sm text-[#8c7b6d]">Loading users...</div>
                  ) : sortedUsers.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-[#8c7b6d]">No users found.</div>
                  ) : (
                    sortedUsers.map((user) => (
                      <div
                        key={user.id}
                        className="grid grid-cols-[1.3fr_1fr_1fr_1fr_120px] gap-3 px-4 py-4 text-sm"
                      >
                        <div>
                          <div className="font-semibold text-[#2b2018]">{user.fullName || user.email || user.id}</div>
                          <div className="text-xs text-[#9a8b7d]">{user.email}</div>
                        </div>
                        <div className="text-[#6f5f52]">{ROLE_LABELS[user.role] || user.role}</div>
                        <div className="text-[#6f5f52]">{branchLabel(user.defaultBranch)}</div>
                        <div className="text-[#6f5f52]">{formatDate(user.lastSignInAt) || "Never"}</div>
                        <div className="text-right">
                          <button
                            type="button"
                            onClick={() => beginEdit(user)}
                            className="rounded-full bg-[#fff1e3] px-3 py-1.5 text-xs font-semibold text-[#c96f15] transition hover:bg-[#ffe2c8]"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#efe6dc] bg-white p-5 shadow-[0_14px_40px_-30px_rgba(58,41,29,0.6)]">
              <h2 className="text-lg font-semibold text-[#2b2018]">Edit access</h2>
              <p className="mt-1 text-sm text-[#8c7b6d]">
                Choose a user, then update their display name, role, and default branch.
              </p>

              <form onSubmit={saveUser} className="mt-6 space-y-4">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-[#5a4a3f]">Selected user</span>
                  <select
                    value={form.userId}
                    onChange={(event) => {
                      const selected = sortedUsers.find((user) => user.id === event.target.value);
                      if (!selected) {
                        resetForm();
                        return;
                      }
                      beginEdit(selected);
                    }}
                    className="w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                  >
                    <option value="">Select a user</option>
                    {sortedUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName || user.email || user.id}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-[#5a4a3f]">Display name</span>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, fullName: event.target.value }))
                    }
                    placeholder="e.g. Jane Doe"
                    className="w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-[#5a4a3f]">Role</span>
                  <select
                    value={form.role}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, role: event.target.value }))
                    }
                    className="w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-[#5a4a3f]">Default branch</span>
                  <select
                    value={form.defaultBranch}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, defaultBranch: event.target.value }))
                    }
                    className="w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                  >
                    <option value="">Unassigned</option>
                    {BRANCH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={!form.userId || savingUserId === form.userId}
                    className="flex-1 rounded-xl bg-[#ff7a1a] py-3 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingUserId === form.userId ? "Saving..." : "Save user"}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-[#efe6dc] px-4 py-3 text-sm font-semibold text-[#6f5f52] transition hover:border-[#ffb47b] hover:text-[#c96f15]"
                  >
                    Clear
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
