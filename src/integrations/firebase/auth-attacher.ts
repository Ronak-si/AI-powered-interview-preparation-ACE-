import { createMiddleware } from "@tanstack/react-start";
import { auth } from "@/integrations/firebase/client";

export const attachFirebaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
