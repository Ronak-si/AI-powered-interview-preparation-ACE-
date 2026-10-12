import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "gen-lang-client-0224543585";
const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const token = getRequest()?.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized: sign in to continue.");
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (typeof payload.sub !== "string") throw new Error("Unauthorized: invalid Firebase user.");
  return next({ context: { userId: payload.sub, firebaseToken: token } });
});
