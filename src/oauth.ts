import type { FetchHandlerObject } from "@atcute/client";
import type { At } from "@atcute/client/lexicons";

export interface ObsidianAtpOauthClient {
    authenticate(handle: string): Promise<FetchHandlerObject & { sub: At.DID; }>;
}