/**
 * Browser origins permitted to call the API. This list is also the CSRF defense for
 * cookie sessions: the CORS middleware in app.ts rejects (403) any request that carries an
 * Origin header not on it — which every cross-site browser POST does — before auth or any
 * route runs. Never widen it to "*" or reflect arbitrary origins.
 */
export const allowedOrigins: string[] = [
  process.env.CORS_ORIGIN,
  process.env.CORS_ORIGIN_2,
  process.env.CORS_ORIGIN_3,
].filter((o): o is string => Boolean(o));
