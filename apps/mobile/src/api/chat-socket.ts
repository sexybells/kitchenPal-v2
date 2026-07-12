import { ChatSocket } from "./socket";
import { API_BASE_URL, api } from "./api";
import { useSessionStore } from "../store/session";

/**
 * App-wide chat/notification socket, wired to the session and REST client:
 *  - the handshake reads the current access token from the session store;
 *  - an expired-token `unauthorized` triggers the REST client's single-flight
 *    refresh, then the socket reconnects with the rotated token;
 *  - a failed refresh resolves to `null`, so the socket stays closed and the
 *    session's own sign-out (from the REST client) takes over.
 */
export const chatSocket = new ChatSocket({
  url: API_BASE_URL,
  tokens: {
    getAccessToken: () => useSessionStore.getState().accessToken,
    refreshAccessToken: async () => {
      try {
        await api.refresh();
      } catch {
        return null;
      }
      return useSessionStore.getState().accessToken;
    },
  },
});
