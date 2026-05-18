import { NextResponse } from "next/server";

function hasInvalidRouterStateHeader(request) {
  const isRscRequest = request.headers.get("rsc") === "1";
  if (!isRscRequest) {
    return false;
  }

  const rawStateTree = request.headers.get("next-router-state-tree");
  if (!rawStateTree) {
    return false;
  }

  try {
    const decoded = decodeURIComponent(rawStateTree);
    const parsed = JSON.parse(decoded);
    return !Array.isArray(parsed);
  } catch (error) {
    return true;
  }
}

export function proxy(request) {
  if (!hasInvalidRouterStateHeader(request)) {
    return NextResponse.next();
  }

  const sanitizedHeaders = new Headers(request.headers);
  sanitizedHeaders.delete("next-router-state-tree");

  return NextResponse.next({
    request: {
      headers: sanitizedHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
