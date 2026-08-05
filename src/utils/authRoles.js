const PRIVILEGED_ROLES = new Set(["admin", "owner", "superadmin"]);
const STAFF_ROLES = new Set(["staff", "cashier", "sales", "clerk"]);

export function getUserRole(user) {
  return (
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
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

export function isStaffMember(user) {
  const role = getUserRole(user);
  return STAFF_ROLES.has(role) || Boolean(user) && !PRIVILEGED_ROLES.has(role);
}

export function canAccessStaffSales(user) {
  return Boolean(user) && (isStaffMember(user) || isAdminOrOwner(user));
}

export function getUserDefaultBranch(user) {
  const branch =
    user?.user_metadata?.default_branch ||
    user?.user_metadata?.branch ||
    user?.app_metadata?.default_branch ||
    user?.app_metadata?.branch ||
    "";

  return typeof branch === "string" ? branch.trim() : "";
}
