import Home from './routes/Home.svelte';
import Page from './routes/Page.svelte';
import NotFound from './routes/NotFound.svelte';

export default {
    '/': Home,
    '/private-page/:handle/:rkey/:passphrase?': Page,
    '/page/:handle/:rkey': Page,
    // The catch-all route must always be last
    '*': NotFound
};
