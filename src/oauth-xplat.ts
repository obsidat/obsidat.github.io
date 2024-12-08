import { configureOAuth, createAuthorizationUrl, finalizeAuthorization, getSession, OAuthUserAgent, resolveFromIdentity } from '@atcute/oauth-browser-client';
import { ObsidianAtpOauthClient } from './oauth';
import { App, Modal, Setting } from 'obsidian';
import type { FetchHandlerObject } from '@atcute/client';

configureOAuth({
    metadata: {
        client_id: 'https://obsidat.github.io/oauth/client-metadata.json',
        redirect_uri: 'https://obsidat.github.io/oauth/redirect.html',
    },
});

class OAuthFinalizationModal extends Modal {
    constructor(app: App, onSubmit: (result: string) => void, onCancel: () => void) {
        super(app);
        this.setTitle('OAuth Authorization');

        let oauthSearch = '';
        new Setting(this.contentEl)
            .setName('Authorize on the opened web page, then copy the result here.')
            .addText((text) =>
                text.onChange((value) => {
                    oauthSearch = value;
                }));

        new Setting(this.contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Submit')
                    .setCta()
                    .onClick(() => {
                        this.close();
                        onSubmit(oauthSearch);
                    }));

        new Setting(this.contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Cancel')
                    .setCta()
                    .onClick(() => {
                        this.close();
                        onCancel();
                    }));
    }
}

export class ObsidianAtpOauthClientXPlat implements ObsidianAtpOauthClient {
    constructor(private readonly app: App) {}

    async authenticate(handle: string): Promise<FetchHandlerObject & { sub: At.DID; }> {
        const { identity, metadata } = await resolveFromIdentity(handle);

        try {
            const existingSession = await getSession(identity.id, { allowStale: true });

            // now you can start making requests!
            const agent = new OAuthUserAgent(existingSession);

            console.log('Refreshed session:', await agent.getSession())

            return agent;
        } catch (err) {
            console.error('Could not refresh session:', err);
        }

        // passing `identity` is optional,
        // it allows for the login form to be autofilled with the user's handle or DID
        const authUrl = await createAuthorizationUrl({
            metadata: metadata,
            identity: identity,
            scope: 'atproto transition:generic',
        });

        console.log(authUrl);

        // recommended to wait for the browser to persist local storage before proceeding
        await sleep(200);

        // redirect the user to sign in and authorize the app
        window.open(authUrl, '_blank', 'noopener,noreferrer');

        const hash = await new Promise<string>((resolve, reject) => {
            new OAuthFinalizationModal(this.app, resolve, reject).open();
        });

        // `createAuthorizationUrl` asks for the server to redirect here with the
        // parameters assigned in the hash, not the search string.
        const params = new URLSearchParams(hash);

        // you'd be given a session object that you can then pass to OAuthUserAgent!
        const session = await finalizeAuthorization(params);

        // now you can start making requests!
        const agent = new OAuthUserAgent(session);

        return agent;
    }
}