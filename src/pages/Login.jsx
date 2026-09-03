import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
    setIsSubmitting(true);

    try {
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
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
      setIsSubmitting(false);
      return;
    }

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: emailValue,
        password: pass,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmed=1`
        }
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setSignupForm({ email: "", password: "", confirm: "" });
      setMode("login");
      setError("Account created. Please check your email to confirm.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    const emailValue = forgotForm.email.trim();
    if (!emailValue) {
      setError("Please enter your email.");
      setIsSubmitting(false);
      return;
    }

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailValue, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setForgotForm({ email: "" });
      setMode("login");
      setError("Password reset email sent.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const modeTitle =
    mode === "login" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password";

  const modeCopy =
    mode === "login"
      ? "Sign in with your work email to access sales, stock, and branch activity."
      : mode === "signup"
      ? "Create a team account for your branch or admin role."
      : "We'll send a reset link to your inbox.";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#fff8f1_0%,#f6efe7_46%,#efe7de_100%)]">
      <div className="pointer-events-none absolute -top-24 -left-28 h-80 w-80 rounded-full bg-[#ffd4aa] opacity-55 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 translate-x-1/3 translate-y-1/4 rounded-full bg-[#ffe9d3] opacity-65 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden overflow-hidden rounded-[32px] border border-[rgba(97,72,56,0.12)] bg-[linear-gradient(160deg,rgba(32,22,17,0.98)_0%,rgba(54,34,23,0.98)_55%,rgba(17,11,8,0.98)_100%)] p-8 text-white shadow-[0_28px_80px_-40px_rgba(24,15,10,0.72)] lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ffcb98]">
                Sio Republic
              </div>
              <h1 className="max-w-xl text-4xl font-semibold leading-tight text-white">
                One workspace for the people running the floor.
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-6 text-[#dcc9bd]">
                Track what sold, what is left, and what needs attention without bouncing between
                disconnected tools.
              </p>
            </div>

            <div className="border-t border-white/10 pt-6">
              <div className="grid gap-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[#ffcb98]" />
                  <div>
                    <p className="text-sm font-semibold text-white">Fast sales entry</p>
                    <p className="mt-1 text-sm leading-6 text-[#c5b1a5]">
                      Record branch sales quickly without losing the batch.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[#ffcb98]" />
                  <div>
                    <p className="text-sm font-semibold text-white">Clear stock signals</p>
                    <p className="mt-1 text-sm leading-6 text-[#c5b1a5]">
                      See what needs attention before it slows the floor down.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[#ffcb98]" />
                  <div>
                    <p className="text-sm font-semibold text-white">Forecasts that help</p>
                    <p className="mt-1 text-sm leading-6 text-[#c5b1a5]">
                      Plan the next reorder from recent sales, not guesswork.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="w-full max-w-[540px] rounded-[32px] border border-[rgba(97,72,56,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,251,247,0.92)_100%)] p-6 shadow-[0_28px_80px_-40px_rgba(24,15,10,0.35)] sm:p-8">
              <div className="flex flex-col items-start gap-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f46f1a] text-white shadow-lg shadow-orange-200">
                    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
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
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b85d11]">
                      Sio Republic
                    </p>
                    <h2 className="text-2xl font-semibold text-[var(--app-text)]">
                      Smart Inventory
                    </h2>
                  </div>
                </div>

                <div>
                  <h3 className="text-3xl font-semibold tracking-tight text-[var(--app-text)]">
                    {modeTitle}
                  </h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--surface-muted)]">
                    {modeCopy}
                  </p>
                </div>

                {mode === "login" && (
                  <form onSubmit={handleSubmit} className="w-full space-y-4">
                    <div>
                      <label htmlFor="login-email" className="text-sm font-medium text-[#5a4a3f]">
                        Email
                      </label>
                      <input
                        id="login-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        className="mt-1 w-full rounded-2xl border border-[rgba(97,72,56,0.12)] bg-white px-4 py-3 text-sm text-[#2a211a] outline-none transition focus:border-[#f46f1a] focus:ring-4 focus:ring-[#ffe2c8]"
                        placeholder="name@company.com"
                      />
                      <p className="mt-1 text-xs text-[#9a8b7d]">
                        Use the email tied to your staff or admin account.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="login-password" className="text-sm font-medium text-[#5a4a3f]">
                        Password
                      </label>
                      <div className="relative mt-1">
                        <input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          className="w-full rounded-2xl border border-[rgba(97,72,56,0.12)] bg-white px-4 py-3 pr-20 text-sm text-[#2a211a] outline-none transition focus:border-[#f46f1a] focus:ring-4 focus:ring-[#ffe2c8]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute inset-y-0 right-2 my-auto rounded-full px-3 text-xs font-semibold text-[#b85d11] transition hover:text-[#9f4c09]"
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div
                        className={`rounded-2xl border px-4 py-3 text-sm ${
                          error.toLowerCase().includes("sent") ||
                          error.toLowerCase().includes("created")
                            ? "border-[#dcefd8] bg-[#f4fbf1] text-[#2e7d46]"
                            : "border-[#ffd6d0] bg-[#fff4f2] text-[#b0483b]"
                        }`}
                      >
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full rounded-2xl bg-[#f46f1a] py-3 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ee6310] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSubmitting ? "Signing in..." : "Sign in"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="w-full text-sm font-semibold text-[#b85d11] transition hover:text-[#9f4c09]"
                    >
                      Forgot your password?
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("signup")}
                      className="w-full text-sm font-semibold text-[var(--surface-muted)] transition hover:text-[var(--app-text)]"
                    >
                      Need a new account?
                    </button>
                  </form>
                )}

                {mode === "signup" && (
                  <form onSubmit={handleSignup} className="w-full space-y-4">
                    <div>
                      <label htmlFor="signup-email" className="text-sm font-medium text-[#5a4a3f]">
                        Email
                      </label>
                      <input
                        id="signup-email"
                        type="email"
                        value={signupForm.email}
                        onChange={(e) =>
                          setSignupForm((prev) => ({ ...prev, email: e.target.value }))
                        }
                        autoComplete="email"
                        className="mt-1 w-full rounded-2xl border border-[rgba(97,72,56,0.12)] bg-white px-4 py-3 text-sm text-[#2a211a] outline-none transition focus:border-[#f46f1a] focus:ring-4 focus:ring-[#ffe2c8]"
                        placeholder="name@company.com"
                      />
                    </div>
                    <div>
                      <label htmlFor="signup-password" className="text-sm font-medium text-[#5a4a3f]">
                        Password
                      </label>
                      <div className="relative mt-1">
                        <input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          value={signupForm.password}
                          onChange={(e) =>
                            setSignupForm((prev) => ({ ...prev, password: e.target.value }))
                          }
                          autoComplete="new-password"
                          className="w-full rounded-2xl border border-[rgba(97,72,56,0.12)] bg-white px-4 py-3 pr-20 text-sm text-[#2a211a] outline-none transition focus:border-[#f46f1a] focus:ring-4 focus:ring-[#ffe2c8]"
                          placeholder="Create a password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute inset-y-0 right-2 my-auto rounded-full px-3 text-xs font-semibold text-[#b85d11] transition hover:text-[#9f4c09]"
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="signup-confirm" className="text-sm font-medium text-[#5a4a3f]">
                        Confirm password
                      </label>
                      <input
                        id="signup-confirm"
                        type={showPassword ? "text" : "password"}
                        value={signupForm.confirm}
                        onChange={(e) =>
                          setSignupForm((prev) => ({ ...prev, confirm: e.target.value }))
                        }
                        autoComplete="new-password"
                        className="mt-1 w-full rounded-2xl border border-[rgba(97,72,56,0.12)] bg-white px-4 py-3 text-sm text-[#2a211a] outline-none transition focus:border-[#f46f1a] focus:ring-4 focus:ring-[#ffe2c8]"
                        placeholder="Repeat your password"
                      />
                    </div>

                    {error && (
                      <div
                        className={`rounded-2xl border px-4 py-3 text-sm ${
                          error.toLowerCase().includes("sent") ||
                          error.toLowerCase().includes("created")
                            ? "border-[#dcefd8] bg-[#f4fbf1] text-[#2e7d46]"
                            : "border-[#ffd6d0] bg-[#fff4f2] text-[#b0483b]"
                        }`}
                      >
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full rounded-2xl bg-[#f46f1a] py-3 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ee6310] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSubmitting ? "Creating..." : "Create account"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="w-full text-sm font-semibold text-[var(--surface-muted)] transition hover:text-[var(--app-text)]"
                    >
                      Back to sign in
                    </button>
                  </form>
                )}

                {mode === "forgot" && (
                  <form onSubmit={handleForgot} className="w-full space-y-4">
                    <div>
                      <label htmlFor="reset-email" className="text-sm font-medium text-[#5a4a3f]">
                        Email
                      </label>
                      <input
                        id="reset-email"
                        type="email"
                        value={forgotForm.email}
                        onChange={(e) =>
                          setForgotForm((prev) => ({ ...prev, email: e.target.value }))
                        }
                        autoComplete="email"
                        className="mt-1 w-full rounded-2xl border border-[rgba(97,72,56,0.12)] bg-white px-4 py-3 text-sm text-[#2a211a] outline-none transition focus:border-[#f46f1a] focus:ring-4 focus:ring-[#ffe2c8]"
                        placeholder="name@company.com"
                      />
                    </div>

                    {error && (
                      <div
                        className={`rounded-2xl border px-4 py-3 text-sm ${
                          error.toLowerCase().includes("sent") ||
                          error.toLowerCase().includes("created")
                            ? "border-[#dcefd8] bg-[#f4fbf1] text-[#2e7d46]"
                            : "border-[#ffd6d0] bg-[#fff4f2] text-[#b0483b]"
                        }`}
                      >
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full rounded-2xl bg-[#f46f1a] py-3 text-sm font-semibold text-white shadow-md shadow-orange-200 transition hover:bg-[#ee6310] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSubmitting ? "Sending..." : "Send reset link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="w-full text-sm font-semibold text-[var(--surface-muted)] transition hover:text-[var(--app-text)]"
                    >
                      Back to sign in
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
