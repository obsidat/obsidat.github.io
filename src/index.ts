(async () => {
    global.Buffer = typeof Buffer !== 'undefined' ? (await import('buffer')).Buffer : Buffer;

    await import('./real-index.ts');
})();