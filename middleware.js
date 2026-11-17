// Password protection for the whole hub (Vercel Routing Middleware, runs before any file is served).
// The browser shows its own login prompt; credentials come from Vercel Environment Variables:
//   HUB_USER      login (optional, defaults to "review")
//   HUB_PASSWORD  password (required; without it the site stays closed)
// Change the password in Vercel -> Settings -> Environment Variables, then redeploy.

export const config = { matcher: "/:path*" };

export default function middleware(request) {
  const user = process.env.HUB_USER || "review";
  const pass = process.env.HUB_PASSWORD;
  if (!pass) {
    return new Response("Password is not configured.", { status: 503 });
  }

  const header = request.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try { decoded = atob(encoded); } catch (e) { decoded = ""; }
    const i = decoded.indexOf(":");
    if (i > -1 && decoded.slice(0, i) === user && decoded.slice(i + 1) === pass) {
      return; // correct credentials: serve the requested file
    }
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Prototypes", charset="UTF-8"' }
  });
}
