import { generateForecast } from "../src/lib/forecastEngine.js";

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  return await new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateForecastRequest(body) {
  const errors = [];
  const horizonDays = Number(body.horizonDays);

  if (!Number.isFinite(horizonDays) || ![7, 14, 30].includes(horizonDays)) {
    errors.push("horizonDays must be one of 7, 14, or 30.");
  }
  if (body.salesHistory !== undefined && !Array.isArray(body.salesHistory)) {
    errors.push("salesHistory must be an array.");
  }
  if (body.inventory !== undefined && !Array.isArray(body.inventory)) {
    errors.push("inventory must be an array.");
  }

  return { errors, horizonDays };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (!isPlainObject(body)) {
      res.status(400).json({
        error: "Invalid request payload.",
        detail: "The request body must be a JSON object."
      });
      return;
    }

    const { errors, horizonDays } = validateForecastRequest(body);
    if (errors.length > 0) {
      res.status(400).json({
        error: "Invalid forecast request.",
        detail: errors.join(" ")
      });
      return;
    }

    const result = await generateForecast({
      salesHistory: body.salesHistory,
      inventory: body.inventory,
      horizonDays,
      statsServiceUrl: globalThis.process?.env?.FORECAST_STATS_SERVICE_URL,
      summaryServiceUrl: globalThis.process?.env?.FORECAST_SUMMARY_URL
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: "Forecast generation failed.",
      detail: error?.message || "Unknown error"
    });
  }
}
