import { auth } from "@/lib/auth/auth";

export default auth(async (req, res) => {
  if (!req.auth) {
    if (req.nextUrl.pathname.startsWith("/protected")) {
      const newUrl = new URL("/sign-in", req.nextUrl.origin);
      return Response.redirect(newUrl);
    }

    if (req.nextUrl.pathname.startsWith("/api/protected")) {
      return new Response("Unauthorized", { status: 404 });
    }
  }

  if (req.auth && req.nextUrl.pathname === "/sign-in") {
    const newUrl = new URL("/protected", req.nextUrl.origin)
    return Response.redirect(newUrl)
  }
})
