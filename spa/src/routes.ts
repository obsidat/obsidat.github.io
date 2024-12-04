import Home from './routes/Home.svelte';
import Lorem from './routes/Lorem.svelte';
import NotFound from './routes/NotFound.svelte';

export default {
    '/': Home,
    '/private-page/:handle/:rkey/:passphrase': Lorem,
    '/page/:handle/:rkey': Lorem,
    // The catch-all route must always be last
    '*': NotFound
};
