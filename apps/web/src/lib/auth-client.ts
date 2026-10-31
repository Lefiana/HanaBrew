import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { API_URL } from "./env";

/** Browser-side Better Auth client. It only talks to the HanaBrew API; no auth logic lives here. */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/api/auth",
  plugins: [usernameClient()],
  fetchOptions: { credentials: "include" },
});
