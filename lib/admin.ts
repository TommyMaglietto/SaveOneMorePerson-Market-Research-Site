import "server-only";

import { createHmac } from "crypto";

export const ADMIN_COOKIE_NAME = "somp_admin";
const ADMIN_SESSION_MESSAGE = "somp-admin-session";

export function getAdminSessionValue() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return null;
  }

  return createHmac("sha256", adminPassword)
    .update(ADMIN_SESSION_MESSAGE)
    .digest("hex");
}

export function isAdminSession(cookieValue?: string | null) {
  const expected = getAdminSessionValue();
  if (!expected || !cookieValue) {
    return false;
  }
  return cookieValue === expected;
}
