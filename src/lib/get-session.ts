"use server";

import { DEV_USER } from "./dev-session";

// For development, always return the dev user session
// In production, this would call auth() from next-auth
export async function getSession() {
  // DEV MODE: Always return dev session
  return {
    user: DEV_USER,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function getOrganizationId(): Promise<string> {
  return DEV_USER.organizationId;
}

export async function getUserId(): Promise<string> {
  return DEV_USER.id;
}
