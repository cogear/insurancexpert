import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const pathname = nextUrl.pathname;

  // Public routes - no auth required
  const publicPaths = [
    "/",
    "/login",
    "/register",
    "/pricing",
    "/api/webhooks",
    "/auth",
  ];

  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );

  // API routes that don't need auth
  const publicApiPaths = ["/api/webhooks/stripe"];
  const isPublicApi = publicApiPaths.some((path) => pathname.startsWith(path));

  // Allow public paths
  if (isPublicPath || isPublicApi) {
    return NextResponse.next();
  }

  // Require authentication for all other routes
  if (!session?.user) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check subscription for premium features
  const premiumPaths = ["/api-access", "/integrations", "/reports/advanced"];
  const isPremiumPath = premiumPaths.some((path) => pathname.startsWith(path));

  if (isPremiumPath) {
    const tier = session.user.subscriptionTier;
    if (!["professional", "enterprise"].includes(tier)) {
      return NextResponse.redirect(new URL("/upgrade", nextUrl));
    }
  }

  // Check enterprise features
  const enterprisePaths = ["/admin", "/api/admin"];
  const isEnterprisePath = enterprisePaths.some((path) =>
    pathname.startsWith(path)
  );

  if (isEnterprisePath) {
    const tier = session.user.subscriptionTier;
    if (tier !== "enterprise") {
      return NextResponse.redirect(new URL("/upgrade", nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
