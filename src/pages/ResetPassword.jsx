import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ password: "", confirm: "" });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(data.session));
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: form.password
    });
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    setTimeout(() => navigate("/login"), 1200);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#fbf8f4] via-[#fbf8f4] to-[#f5efe8]">
      <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl bg-white/90 p-8 shadow-[0_18px_60px_-30px_rgba(91,71,54,0.6)] backdrop-blur">
          <h1 className="text-xl font-semibold text-[#1f1b16]">Reset Password</h1>
          <p className="mt-1 text-sm text-[#8b7a6b]">
            Set a new password for your account.
          </p>

          {!ready && (
            <p className="mt-6 rounded-xl border border-[#efe5db] bg-white px-4 py-3 text-sm text-[#8b7a6b]">
              Please open the reset link from your email to continue.
            </p>
          )}

          {ready && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-[#5a4a3f]">
                  New Password
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[#5a4a3f]">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={form.confirm}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, confirm: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                />
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}
              {success && (
                <div className="text-sm text-green-700">
                  Password updated. Redirecting to login.
                </div>
              )}

              <button
                type="submit"
                className="mt-2 w-full rounded-xl bg-[#ff7a1a] py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00]"
              >
                Update Password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

