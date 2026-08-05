# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## AI Forecast Setup

The demand forecast page calls a server-side endpoint at `/api/forecast`.

Set these environment variables in your deployment or local shell:

- `FORECAST_STATS_SERVICE_URL` optional, points to a local or self-hosted statsmodels service such as `http://127.0.0.1:8787/forecast`
- `FORECAST_SUMMARY_URL` optional, points to a local summary-only LLM endpoint if you want generated prose without changing the forecast numbers

The free baseline is always the heuristic forecast inside the app, so the page still works even when no service is configured.

If you want better accuracy without cloud costs, run the small Python service in `forecast-service/`:

```bash
cd forecast-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

That service uses `statsmodels` for the actual numbers. If you later want a local LLM just for the written explanation, point `FORECAST_SUMMARY_URL` at that separate endpoint and keep the forecast math untouched.

## Daily Sales Report Setup

The app can send one daily sales report at 8:00 PM that groups all sales by branch and item.

Set these environment variables in your deployment or local shell:

- `REPORT_TO_EMAIL` email address that should receive the report, such as your Gmail
- `RECEIPT_TO_EMAIL` optional fallback if `REPORT_TO_EMAIL` is not set
- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_HOST` optional, defaults to `smtp.gmail.com`
- `SMTP_PORT` optional, defaults to `465`
- `SMTP_SECURE` optional, set to `false` if your SMTP provider needs a non-SSL connection
- `SMTP_USER` Gmail or SMTP username
- `SMTP_PASS` Gmail app password or SMTP password
- `REPORT_FROM_EMAIL` optional, defaults to `SMTP_USER`
- `RECEIPT_FROM_EMAIL` optional fallback if `REPORT_FROM_EMAIL` is not set
- `REPORT_TIMEZONE_OFFSET_HOURS` optional, defaults to `8` for Asia/Shanghai

On Vercel, the report is scheduled with a cron job at `0 12 * * *`, which is `8:00 PM` in Asia/Shanghai.

If the mail or Supabase service variables are missing, the scheduled job will skip sending instead of breaking the app.

## Branch Receipts

When staff finalize a branch receipt, the app emails that receipt to the configured owner inbox.

Set these environment variables:

- `REPORT_TO_EMAIL` preferred owner email for finalized branch receipts
- `RECEIPT_TO_EMAIL` optional fallback if `REPORT_TO_EMAIL` is not set
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_HOST` optional, defaults to `smtp.gmail.com`
- `SMTP_PORT` optional, defaults to `465`
- `SMTP_SECURE` optional, set to `false` if your SMTP provider needs a non-SSL connection
- `RECEIPT_FROM_EMAIL` optional fallback sender address

## Testing

Run the current test suite with:

```bash
npm test
```

The current coverage includes:

- role and branch helpers
- inventory ordering rules
- local forecast fallback behavior
- routing guards for login and staff sales
- the staff sale entry flow
- smoke tests for the forecast, daily report, and receipt endpoints

GitHub Actions runs the same test command on push and pull request.
