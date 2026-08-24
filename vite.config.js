import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const LOCAL_API_ROUTES = new Map([
  ["/api/forecast", "./api/forecast.js"],
  ["/api/daily-sales-report", "./api/daily-sales-report.js"],
  ["/api/sale-receipt", "./api/sale-receipt.js"],
  ["/api/admin-users", "./api/admin-users.js"],
  ["/api/audit-log", "./api/audit-log.js"],
  ["/api/sales-sync", "./api/sales-sync.js"]
]);

async function readRequestBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(globalThis.Buffer.from(chunk));
  }

  if (chunks.length === 0) return {};

  const rawBody = globalThis.Buffer.concat(chunks).toString("utf8");
  if (!rawBody.trim()) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

function createLocalApiPlugin() {
  return {
    name: "local-api-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const pathname = new URL(req.url, "http://localhost").pathname;
        const routePath = LOCAL_API_ROUTES.get(pathname);

        if (!routePath) {
          next();
          return;
        }

        try {
          const { default: handler } = await import(/* @vite-ignore */ new URL(routePath, import.meta.url).href);
          if (typeof handler !== "function") {
            throw new Error(`API handler not found for ${pathname}`);
          }

          const body = req.method === "GET" || req.method === "HEAD" ? {} : await readRequestBody(req);
          req.body = body;

          if (typeof res.status !== "function") {
            res.status = function status(code) {
              res.statusCode = code;
              return res;
            };
          }

          if (typeof res.json !== "function") {
            res.json = function json(payload) {
              if (!res.getHeader("Content-Type")) {
                res.setHeader("Content-Type", "application/json");
              }
              res.end(JSON.stringify(payload));
              return res;
            };
          }

          await handler(req, res);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "Local API request failed.",
              detail: error?.message || "Unknown error"
            })
          );
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, globalThis.process.cwd(), "");
  Object.assign(globalThis.process.env, env);

  return {
    plugins: [react(), tailwindcss(), createLocalApiPlugin()],
    test: {
      environment: "jsdom",
      setupFiles: ["./tests/setup.js"],
      globals: true
    }
  };
});
