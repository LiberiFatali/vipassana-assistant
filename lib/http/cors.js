// Requests from the same deployment (null origin from file://, or the Vercel
// domain) are always permitted. Origins not on this list receive a 403.
// Adjust ALLOWED_ORIGINS to match your production domain(s).
export const ALLOWED_ORIGINS = [
  // Allow same-origin (browser omits Origin on same-origin requests in some
  // cases, so we also allow absent Origin in addCorsHeaders below).
  // Pattern-match: any *.vercel.app subdomain + any custom domains you add.
];

export const VERCEL_ORIGIN_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/i;

export function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin (no Origin header) or server-to-server
  if (VERCEL_ORIGIN_RE.test(origin)) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow localhost in development
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

export function addCorsHeaders(headers, origin) {
  const allowedOrigin = isAllowedOrigin(origin) ? (origin || "*") : null;
  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Accept";
    headers["Vary"] = "Origin";
  }
  return headers;
}
