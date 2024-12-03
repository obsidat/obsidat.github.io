import { App, Modal, Platform } from 'obsidian';
import { mount, unmount } from 'svelte';
import { BrowserOAuthClient, OAuthSession } from '@atproto/oauth-client-browser'

import OAuthComponent from './components/oauth.svelte';
import clientMetadata from './client-metadata.ts';

export class OAuthModal extends Modal {
    component?: { pee: 5; } & { $set?: any; $on?: any; };
    constructor(app: App) {
        super(app);
    }

    async onOpen() {
        this.component = mount(OAuthComponent, {
            target: this.contentEl,
            props: {
                variable: 1
            }
        });
    }

    async onClose() {
        if (this.component) unmount(this.component);
    }
}

const IP = `127.0.0.1`;
const BASE_URL = `http://${IP}:17051`;

const client = new BrowserOAuthClient({
    // Note that the origin of the "client_id" URL must be "http://localhost" when
    // using this configuration, regardless of the actual hostname ("127.0.0.1" or
    // "[::1]"), port or pathname. Only the `redirect_uris` must contain the
    // actual url that will be used to redirect the user back to the application.
    clientMetadata: `http://localhost?redirect_uri=${encodeURIComponent(`${BASE_URL}/callback`)}`,

    handleResolver: 'https://bsky.social',
})

const result: undefined | { session: OAuthSession; state?: string } = await client.init();

if (result) {
  const { session, state } = result;
  if (state != null) {
    console.log(`${session.sub} was successfully authenticated (state: ${state})`,);
  } else {
    console.log(`${session.sub} was restored (last active session)`);
  }
}