import type { OAuthClientMetadataInput } from "@atproto/oauth-client-browser";

const BASE_URL = 'http://127.0.0.1:17051';

export default {
    "client_id": "${BASE_URL}/client-metadata.json",
    "client_name": "My App",
    "client_uri": `${BASE_URL}`,
    "logo_uri": `${BASE_URL}/logo.png`,
    "tos_uri": `${BASE_URL}/tos`,
    "policy_uri": `${BASE_URL}/policy`,
    "redirect_uris": [
        `${BASE_URL}/callback`
    ],
    "scope": "atproto",
    "grant_types": [
        "authorization_code",
        "refresh_token"
    ],
    "response_types": [
        "code"
    ],
    "token_endpoint_auth_method": "none",
    "application_type": "web",
    "dpop_bound_access_tokens": true
} satisfies Readonly<OAuthClientMetadataInput>;