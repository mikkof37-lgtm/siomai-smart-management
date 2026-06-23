const PRIVILEGED_ROLES = new Set(["admin", "owner", "superadmin"]);

export function getUserRole(user) {
  return (
    user?.app_metadata?.role ||
    user?.role ||
    ""
  )
    .toString()
    .trim()
    .toLowerCase();
}

export function isAdminOrOwner(user) {
  return PRIVILEGED_ROLES.has(getUserRole(user));
}
