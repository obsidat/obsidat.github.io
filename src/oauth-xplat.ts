import { configureOAuth } from '@atcute/oauth-browser-client';

configureOAuth({
	metadata: {
		client_id: 'https://obsidat.github.io/oauth/client-metadata.json',
		redirect_uri: 'https://example.com/oauth/callback',
	},
});