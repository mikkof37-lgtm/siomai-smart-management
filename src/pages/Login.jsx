import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("login");
  const [signupForm, setSignupForm] = useState({
    email: "",
    password: "",
    confirm: ""
  });
  const [forgotForm, setForgotForm] = useState({
    email: ""
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (signInError) {
      setError(signInError.message);
      return;
    }
    sessionStorage.setItem("login_toast", "1");
    navigate("/", { replace: true });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    const emailValue = signupForm.email.trim();
    const pass = signupForm.password;
    const confirm = signupForm.confirm;

    if (!emailValue || !pass) {
      setError("Please complete all required fields.");
      return;
    }
    if (pass.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (pass !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email: emailValue,
      password: pass
    });
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setSignupForm({ email: "", password: "", confirm: "" });
    setMode("login");
    setError("Account created. Please check your email to confirm.");
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError("");
    const emailValue = forgotForm.email.trim();
    if (!emailValue) {
      setError("Please enter your email.");
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      emailValue,
      {
        redirectTo: `${window.location.origin}/reset-password`
      }
    );
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setForgotForm({ email: "" });
    setMode("login");
    setError("Password reset email sent.");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-linear-to-b from-[#fbf8f4] via-[#fbf8f4] to-[#f5efe8]">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#ffd7b0] opacity-50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-[#ffe9d2] opacity-60 blur-3xl" />

      <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ff7a1a] text-white shadow-lg shadow-orange-200">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-7 w-7"
                aria-hidden="true"
              >
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
            <h1 className="text-2xl font-semibold text-[#1f1b16]">
              Sio Republic Admin
            </h1>
            <p className="mt-1 text-sm text-[#7b6b5d]">
              Sign in to manage your inventory
            </p>
          </div>

          <div className="mt-8 rounded-2xl bg-white/90 p-8 shadow-[0_18px_60px_-30px_rgba(91,71,54,0.6)] backdrop-blur">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-[#1f1b16]">
                {mode === "login" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password"}
              </h2>
              <p className="mt-1 text-sm text-[#8b7a6b]">
                {mode === "login"
                  ? "Enter your credentials to access the dashboard"
                  : mode === "signup"
                  ? "Set up your admin access."
                  : "Update your account password."}
              </p>
            </div>

            {mode === "login" && (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-[#5a4a3f]">
                    Email
                  </label>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-[#5a4a3f]">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                  />
                </div>

                {error && (
                  <div
                    className={`text-sm ${
                      error.toLowerCase().includes("sent") ||
                      error.toLowerCase().includes("created")
                        ? "text-green-700"
                        : "text-red-600"
                    }`}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="mt-2 w-full rounded-xl bg-[#ff7a1a] py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00]"
                >
                  Sign In
                </button>
              </form>
            )}

            {mode === "signup" && (
              <form onSubmit={handleSignup} className="mt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-[#5a4a3f]">
                    Email
                  </label>
                  <input
                    type="text"
                    value={signupForm.email}
                    onChange={(e) =>
                      setSignupForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                    placeholder="warehouse-admin@email.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#5a4a3f]">
                    Password
                  </label>
                  <input
                    type="password"
                    value={signupForm.password}
                    onChange={(e) =>
                      setSignupForm((prev) => ({ ...prev, password: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                    placeholder="Create a password"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#5a4a3f]">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={signupForm.confirm}
                    onChange={(e) =>
                      setSignupForm((prev) => ({ ...prev, confirm: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                    placeholder="Repeat your password"
                  />
                </div>

                {error && (
                  <div
                    className={`text-sm ${
                      error.toLowerCase().includes("sent") ||
                      error.toLowerCase().includes("created")
                        ? "text-green-700"
                        : "text-red-600"
                    }`}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="mt-2 w-full rounded-xl bg-[#ff7a1a] py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ff6a00]"
                >
                  Create Account
                </button>
              </form>
            )}

            {mode === "forgot" && (
              <form onSubmit={handleForgot} className="mt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-[#5a4a3f]">
                    Email
                  </label>
                  <input
                    type="text"
                    value={forgotForm.email}
                    onChange={(e) =>
                      setForgotForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-[#efe5db] bg-white px-4 py-2.5 text-sm text-[#2a211a] outline-none transition focus:border-[#ffb47b] focus:ring-4 focus:ring-[#ffe2c8]"
                    placeholder="you@email.com"
                  />
                </div>

                {error && (
                  <div
                    className={`text-sm ${
                      error.toLowerCase().includes("sent") ||
                      error.toLowerCase().includes("created")
                        ? "text-green-700"
                        : "text-red-600"
                    }`}
                  >
                    {error}
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

            <div className="mt-5 space-y-2 text-center text-xs text-[#9b8b7c]">
              {mode === "login" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setMode("signup");
                    }}
                    className="cursor-pointer text-[#ff7a1a] transition hover:text-[#ff6a00] hover:underline hover:underline-offset-4"
                  >
                    Create an account
                  </button>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setMode("forgot");
                      }}
                      className="cursor-pointer text-[#ff7a1a] transition hover:text-[#ff6a00] hover:underline hover:underline-offset-4"
                    >
                      Forgot password?
                    </button>
                  </div>
                </>
              )}
              {mode !== "login" && (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setMode("login");
                  }}
                  className="cursor-pointer text-[#ff7a1a] transition hover:text-[#ff6a00] hover:underline hover:underline-offset-4"
                >
                  Back to login
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
