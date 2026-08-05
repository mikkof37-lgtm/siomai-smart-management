import json
import math
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import date, datetime, timedelta, timezone

from statsmodels.tsa.holtwinters import ExponentialSmoothing, Holt


DEFAULT_PORT = int(os.environ.get("PORT", "8787"))
DEFAULT_SEASONAL_PERIODS = 7


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def safe_float(value, fallback=0.0):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback

    if math.isnan(parsed) or math.isinf(parsed):
        return fallback
    return parsed


def parse_series(payload):
    series = []
    for entry in payload.get("dailySeries", []):
        if not isinstance(entry, dict):
            continue

        units = max(0.0, safe_float(entry.get("units"), 0.0))
        series.append(units)

    return series


def fit_statsmodels(series, horizon_days):
    if not series:
        return {
            "model": "statsmodels-baseline",
            "confidence": 45,
            "predicted": [0 for _ in range(horizon_days)],
        }

    baseline = sum(series) / len(series)
    model_name = "statsmodels-holt"
    fitted_model = None

    seasonal_periods = DEFAULT_SEASONAL_PERIODS
    has_seasonality = len(series) >= seasonal_periods * 3 and baseline > 0

    if has_seasonality:
        try:
            fitted_model = (
                ExponentialSmoothing(
                    series,
                    trend="add",
                    seasonal="add",
                    seasonal_periods=seasonal_periods,
                    initialization_method="estimated",
                )
                .fit(optimized=True, use_brute=True)
            )
            model_name = "statsmodels-holtwinters"
        except Exception:
            fitted_model = None

    if fitted_model is None and len(series) >= 2:
        try:
            fitted_model = Holt(series, damped_trend=True, initialization_method="estimated").fit(
                optimized=True
            )
            model_name = "statsmodels-holt"
        except Exception:
            fitted_model = None

    if fitted_model is None:
        predicted = [max(0, round(baseline)) for _ in range(horizon_days)]
        confidence = 54 if len(series) >= 7 else 46
        return {
            "model": "statsmodels-baseline",
            "confidence": confidence,
            "predicted": predicted,
        }

    try:
        forecast_values = fitted_model.forecast(horizon_days)
    except Exception:
        predicted = [max(0, round(baseline)) for _ in range(horizon_days)]
        confidence = 54 if len(series) >= 7 else 46
        return {
            "model": "statsmodels-baseline",
            "confidence": confidence,
            "predicted": predicted,
        }

    fitted_values = list(getattr(fitted_model, "fittedvalues", []))
    actual_values = series[-len(fitted_values) :] if fitted_values else series
    aligned_fitted = fitted_values[-len(actual_values) :] if fitted_values else []

    if aligned_fitted and actual_values:
        errors = [abs(actual - predicted) for actual, predicted in zip(actual_values, aligned_fitted)]
        mae = sum(errors) / len(errors)
        scale = max(sum(series) / len(series), 1.0)
        error_ratio = mae / scale
        confidence = round(clamp(88 - error_ratio * 55 - max(0, 18 - len(series)), 40, 96))
    else:
        confidence = 58 if len(series) >= 7 else 48

    predicted = [max(0, round(safe_float(value))) for value in forecast_values]
    return {
        "model": model_name,
        "confidence": confidence,
        "predicted": predicted,
    }


def build_forecast_response(payload):
    horizon_days = int(payload.get("horizonDays", 14))
    if horizon_days not in (7, 14, 30):
        horizon_days = 14

    daily_series = parse_series(payload)
    stats = fit_statsmodels(daily_series, horizon_days)

    forecast_start_value = payload.get("forecastStartDate")
    try:
        start_date = datetime.fromisoformat(forecast_start_value).date() if forecast_start_value else date.today()
    except (TypeError, ValueError):
        start_date = date.today()

    demand_series = []
    for offset, predicted in enumerate(stats["predicted"][:horizon_days]):
        day_confidence = clamp(stats["confidence"] - round(offset * 0.8), 35, 96)
        forecast_date = start_date + timedelta(days=offset)
        demand_series.append(
            {
                "date": forecast_date.isoformat(),
                "predictedUnits": int(predicted),
                "confidence": int(day_confidence),
            }
        )

    return {
        "source": "statsmodels",
        "model": stats["model"],
        "horizonDays": horizon_days,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "confidence": stats["confidence"],
        "demandSeries": demand_series,
    }


class ForecastHandler(BaseHTTPRequestHandler):
    def _write_json(self, status_code, payload):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self):
        if self.path.rstrip("/") != "/forecast":
            self._write_json(404, {"error": "Not found."})
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"

        try:
            payload = json.loads(raw or "{}")
        except json.JSONDecodeError:
            self._write_json(400, {"error": "Invalid JSON payload."})
            return

        if not isinstance(payload, dict):
            self._write_json(400, {"error": "The request body must be a JSON object."})
            return

        try:
            response = build_forecast_response(payload)
        except Exception as exc:
            self._write_json(500, {"error": "Forecast generation failed.", "detail": str(exc)})
            return

        self._write_json(200, response)

    def log_message(self, format, *args):
        return


def main():
    server = HTTPServer(("0.0.0.0", DEFAULT_PORT), ForecastHandler)
    print(f"Statsmodels forecast service listening on http://127.0.0.1:{DEFAULT_PORT}/forecast")
    server.serve_forever()


if __name__ == "__main__":
    main()
