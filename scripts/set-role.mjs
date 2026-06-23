import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, "utf8");
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) return;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (!globalThis.process.env[key]) {
        globalThis.process.env[key] = value;
      }
    });
}

loadDotEnv(envPath);

const nodeProcess = globalThis.process;
const userId = nodeProcess.argv[2];
const role = (nodeProcess.argv[3] || "").trim().toLowerCase();

if (!userId || !role) {
  console.error("Usage: npm run set-role -- <user-id> <owner|admin>");
  process.exit(1);
}

if (!["owner", "admin"].includes(role)) {
  console.error("Role must be either 'owner' or 'admin'.");
  process.exit(1);
}

const supabaseUrl = nodeProcess.env.SUPABASE_URL || nodeProcess.env.VITE_SUPABASE_URL;
const serviceRoleKey = nodeProcess.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("Missing SUPABASE_URL or VITE_SUPABASE_URL in .env.");
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const { data, error } = await supabase.auth.admin.updateUserById(userId, {
  app_metadata: { role }
});

if (error) {
  console.error("Failed to update role:", error.message);
  process.exit(1);
}

console.log(`Updated ${data.user.email} to role: ${role}`);
