import { createClient } from "@supabase/supabase-js";
import { BRANCH_OPTIONS } from "../src/data/branches.js";
import { getUserDefaultBranch, getUserRole, isAdminOrOwner } from "../src/utils/authRoles.js";

const SUPABASE_URL =
  globalThis.process?.env?.SUPABASE_URL?.trim() ||
  globalThis.process?.env?.VITE_SUPABASE_URL?.trim() ||
  "";
const SUPABASE_ANON_KEY =
  globalThis.process?.env?.SUPABASE_ANON_KEY?.trim() ||
  globalThis.process?.env?.VITE_SUPABASE_ANON_KEY?.trim() ||
  "";
const SUPABASE_SERVICE_ROLE_KEY =
  globalThis.process?.env?.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body || "{}"));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  return new Promise((resolve, reject) => {
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

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (typeof header !== "string") return "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBranch(branch) {
  const value = normalizeText(branch);
  return BRANCH_OPTIONS.some((option) => option.value === value) ? value : "";
}

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email || "",
    emailConfirmedAt: user.email_confirmed_at || "",
    lastSignInAt: user.last_sign_in_at || "",
    createdAt: user.created_at || "",
    updatedAt: user.updated_at || "",
    role: getUserRole(user) || "staff",
    defaultBranch: getUserDefaultBranch(user),
    fullName:
      normalizeText(user?.user_metadata?.full_name) ||
      normalizeText(user?.user_metadata?.name) ||
      "",
    appMetadata: user.app_metadata || {},
    userMetadata: user.user_metadata || {}
  };
}

function validateRole(role) {
  const normalized = normalizeText(role).toLowerCase();
  const allowedRoles = new Set(["owner", "admin", "staff"]);
  return allowedRoles.has(normalized) ? normalized : "staff";
}

function buildMetadataPatch(currentUser, body) {
  const existingAppMetadata = isPlainObject(currentUser.app_metadata) ? currentUser.app_metadata : {};
  const existingUserMetadata = isPlainObject(currentUser.user_metadata) ? currentUser.user_metadata : {};
  const nextRole = validateRole(body.role);
  const nextBranch = normalizeBranch(body.defaultBranch);
  const nextFullName = normalizeText(body.fullName);

  const appMetadata = {
    ...existingAppMetadata,
    ...(nextRole ? { role: nextRole } : {}),
    ...(nextBranch ? { default_branch: nextBranch, branch: nextBranch } : {})
  };

  const userMetadata = {
    ...existingUserMetadata,
    ...(nextRole ? { role: nextRole } : {}),
    ...(nextBranch ? { default_branch: nextBranch, branch: nextBranch } : {}),
    ...(nextFullName ? { full_name: nextFullName, name: nextFullName } : {})
  };

  if (currentUser.email) {
    userMetadata.email = currentUser.email;
  }

  return { app_metadata: appMetadata, user_metadata: userMetadata };
}

async function requireAdmin(req) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { error: { status: 503, message: "Supabase admin credentials are not configured." } };
  }

  const token = getBearerToken(req);
  if (!token) {
    return { error: { status: 401, message: "Authorization token required." } };
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    return { error: { status: 401, message: "Invalid or expired session." } };
  }

  if (!isAdminOrOwner(data.user)) {
    return { error: { status: 403, message: "Admin access required." } };
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return { user: data.user, serviceClient };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const auth = await requireAdmin(req);
    if (auth.error) {
      res.status(auth.error.status).json({
        error: auth.error.message
      });
      return;
    }

    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
      const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") || "50")));

      const { data, error } = await auth.serviceClient.auth.admin.listUsers({
        page,
        perPage
      });

      if (error) {
        res.status(500).json({
          error: "Unable to load users.",
          detail: error.message || "Unknown error"
        });
        return;
      }

      const users = Array.isArray(data?.users) ? data.users.map(serializeUser) : [];
      res.status(200).json({
        users,
        page: data?.page ?? page,
        perPage: data?.perPage ?? perPage,
        total: data?.total ?? users.length,
        nextPage: data?.nextPage ?? null,
        lastPage: data?.lastPage ?? null,
        currentUser: serializeUser(auth.user)
      });
      return;
    }

    const body = await readJsonBody(req);
    if (!isPlainObject(body)) {
      res.status(400).json({
        error: "Invalid request payload.",
        detail: "The request body must be a JSON object."
      });
      return;
    }

    const targetUserId = normalizeText(body.userId);
    if (!targetUserId) {
      res.status(400).json({
        error: "Missing userId.",
        detail: "A target user id is required."
      });
      return;
    }

  const { data: userData, error: userError } = await auth.serviceClient.auth.admin.getUserById(
      targetUserId
    );
    if (userError || !userData?.user) {
      res.status(404).json({
        error: "User not found.",
        detail: userError?.message || "No matching user was found."
      });
      return;
    }

    const patch = buildMetadataPatch(userData.user, body);
    const { data: updatedData, error: updateError } = await auth.serviceClient.auth.admin.updateUserById(
      targetUserId,
      patch
    );

    if (updateError || !updatedData?.user) {
      res.status(500).json({
        error: "User update failed.",
        detail: updateError?.message || "Unknown error"
      });
      return;
    }

    res.status(200).json({
      user: serializeUser(updatedData.user)
    });
  } catch (error) {
    res.status(500).json({
      error: "Admin users request failed.",
      detail: error?.message || "Unknown error"
    });
  }
}
