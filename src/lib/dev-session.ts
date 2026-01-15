/**
 * Development session bypass
 * Provides a mock session for development without authentication
 */

export const DEV_USER = {
  id: "dev-user-id",
  email: "dev@insurancexpert.local",
  name: "Dev User",
  organizationId: "dev-org-id",
  organizationName: "Dev Organization",
  role: "owner",
  subscriptionTier: "enterprise",
};

export const DEV_ORGANIZATION = {
  id: "dev-org-id",
  name: "Dev Organization",
  slug: "dev-org",
  subscriptionTier: "enterprise",
};

export function getDevSession() {
  return {
    user: DEV_USER,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
