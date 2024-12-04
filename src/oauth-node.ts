import { NodeOAuthClient, OAuthClient, OAuthSession, type NodeSavedSession, type NodeSavedSessionStore, type NodeSavedState, type NodeSavedStateStore, type Session } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import express from 'express';
import { Agent } from '@atproto/api';
import type MyPlugin from './index.ts';
import { randomBytes } from '@noble/hashes/utils';
import { encode as encode85 } from 'base85';
import { toBuffer } from './utils/index.ts';
import type { ObsidianAtpOauthClient } from 'oauth.ts';

export class StateStore implements NodeSavedStateStore {
    constructor(private plugin: MyPlugin) {}
    get(key: string): NodeSavedState | undefined {
        return this.plugin.settings.auth.state[key];
    }
    async set(key: string, val: NodeSavedState) {
        this.plugin.settings.auth.state[key] = val;
        await this.plugin.saveSettings();
    }
    async del(key: string) {
        delete this.plugin.settings.auth.state[key];
        await this.plugin.saveSettings();
    }
}

export class SessionStore implements NodeSavedSessionStore {
    constructor(private plugin: MyPlugin) {}
    get(key: string): NodeSavedSession | undefined {
        return this.plugin.settings.auth.session[key];
    }
    async set(key: string, val: NodeSavedSession) {
        this.plugin.settings.auth.session[key] = val;
        await this.plugin.saveSettings();
    }
    async del(key: string) {
        delete this.plugin.settings.auth.session[key];
        await this.plugin.saveSettings();
    }
}

// https://github.com/bluesky-social/atproto/blob/main/packages/api/OAUTH.md
// for mobile: make it a static site instead of localhost, redirect to a page with a token that the user manually copies in
export class ObsidianAtpOauthClientNode implements ObsidianAtpOauthClient {
    private stateStore = new StateStore(this.plugin);
    private sessionStore = new SessionStore(this.plugin);

    constructor(private plugin: MyPlugin) {}

    async authenticate(handle: string): Promise<OAuthSession> {
        const PORT = 17051;
        const IP = `127.0.0.1`;
        const URL = `http://${IP}:${PORT}`;

        const client = new NodeOAuthClient({
            clientMetadata: {
                client_name: 'AT Protocol Express App',
                client_id: `http://localhost?redirect_uri=${encodeURIComponent(`${URL}/atproto-oauth-callback`)}&scope=${encodeURIComponent('atproto transition:generic')}`,
                client_uri: URL,
                redirect_uris: [`${URL}/atproto-oauth-callback`],
                scope: 'atproto transition:generic',
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                application_type: 'web',
                token_endpoint_auth_method: 'none',
                dpop_bound_access_tokens: true,
            },
            stateStore: this.stateStore,
            sessionStore: this.sessionStore,
        });

        const app = express();

        // Expose the metadata and jwks
        app.get('client-metadata.json', (req, res) => { res.json(client.clientMetadata) });
        app.get('jwks.json', (req, res) => { res.json(client.jwks) });

        const state = encode85(toBuffer(randomBytes(10)));

        // Create an endpoint to initiate the OAuth flow
        app.get('/login', async (req, res, next) => {
            try {
                // Revoke any pending authentication requests if the connection is closed (optional)
                const ac = new AbortController();
                req.on('close', () => ac.abort());

                const url = await client.authorize(handle, {
                    signal: ac.signal,
                    state: req.query.state as string,
                    // Only supported if OAuth server is openid-compliant
                    ui_locales: 'en',
                })

                res.redirect(''+url);
            } catch (err) {
                next(err);
            }
        })

        // Create an endpoint to handle the OAuth callback
        
        const authedSessionLater = new Promise<OAuthSession>((resolve, reject) => {
            app.get('/atproto-oauth-callback', async (req, res, next) => {
                try {
                    const params = new URLSearchParams(req.url.split('?')[1]);

                    const { session, state: outState } = await client.callback(params);

                    if (state !== outState) {
                        return next(new Error(`State mismatch!`));
                    }

                    // Process successful authentication here
                    console.log('authorize() was called with state:', state);

                    console.log('User authenticated as:', session.did);

                    resolve(session);

                    res.json({ ok: true });
                } catch (err) {
                    return next(err);
                }
            });
        });

        return await new Promise((resolve, reject) => {
            app.listen(PORT, IP, () => {
                (async () => {
                    const url = await client.authorize(handle);

                    // Redirect the user to the authorization page
                    window.open(url, '_self', 'noopener');

                    resolve(await authedSessionLater);
                })().catch(reject);
            })
    
        });

        // Whenever needed, restore a user's session
        async function worker() {
            const userDid = 'did:plc:123'

            const oauthSession = await client.restore(userDid)

            // Note: If the current access_token is expired, the session will automatically
            // (and transparently) refresh it. The new token set will be saved though
            // the client's session store.

            const agent = new Agent(oauthSession)

            // Make Authenticated API calls
            const profile = await agent.getProfile({ actor: agent.did! })
            console.log('Bsky profile:', profile.data)
        }
    }
}