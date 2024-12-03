import type { SessionManager } from "@atproto/api/dist/session-manager";
import type { OAuthSession } from "@atproto/oauth-client-browser";

export interface ObsidianAtpOauthClient {
    authenticate(handle: string): Promise<SessionManager>;
}