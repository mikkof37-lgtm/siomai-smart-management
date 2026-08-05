import { Component } from "react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-6">
          <div className="max-w-xl rounded-2xl border border-[#ffd5d0] bg-white p-6 shadow-[0_18px_60px_-30px_rgba(176,72,59,0.35)]">
            <div className="inline-flex rounded-full bg-[#fff4f2] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#b0483b]">
              Runtime error
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-[#2b2018]">The dashboard hit an error</h1>
            <p className="mt-2 text-sm leading-6 text-[#6f5f52]">
              Something in the page crashed while rendering. This screen is here so the app
              does not stay blank.
            </p>
            <pre className="mt-4 overflow-auto rounded-xl bg-[#fff8f7] p-4 text-xs leading-5 text-[#8f4c40]">
              {this.state.error?.message || String(this.state.error)}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

