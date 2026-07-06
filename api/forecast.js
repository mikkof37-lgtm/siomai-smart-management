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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await generateForecast({
      salesHistory: body.salesHistory,
      inventory: body.inventory,
      horizonDays: body.horizonDays,
      apiKey: globalThis.process?.env?.OPENAI_API_KEY,
      model: globalThis.process?.env?.OPENAI_MODEL || "gpt-5.5"
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: "Forecast generation failed.",
      detail: error?.message || "Unknown error"
    });
  }
}
