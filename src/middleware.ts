import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { routeAccessMap } from "./lib/settings";
import { NextResponse } from "next/server";

const matchers = Object.keys(routeAccessMap).map((route) => ({
  matcher: createRouteMatcher([route]),
  allowedRoles: routeAccessMap[route],
}));

export default clerkMiddleware((auth, req) => {
  const { sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role?.toLowerCase();
  const url = req.nextUrl;
  const hostname = req.headers.get("host") || "";

  let currentHost = hostname.replace(`:${url.port}`, "");
  const isLocalhost = currentHost.endsWith("localhost");
  
  let subdomain = null;
  if (isLocalhost && currentHost !== "localhost") {
    subdomain = currentHost.replace(".localhost", "");
  }

  if (subdomain && subdomain !== "www") {
    return NextResponse.rewrite(new URL(`/teacher-courses/${subdomain}${url.pathname}`, req.url));
  }

  if (role && url.pathname === "/") {
    return NextResponse.redirect(new URL(`/${role}`, req.url));
  }

  for (const { matcher, allowedRoles } of matchers) {
    if (matcher(req)) {
      if (!role) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      if (!allowedRoles.includes(role)) {
        return NextResponse.redirect(new URL(`/${role}`, req.url));
      }
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
