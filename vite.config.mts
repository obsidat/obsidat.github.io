import { UserConfig, defineConfig } from 'vite';
import path from 'path';
import builtins from 'builtin-modules';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import tsconfigPaths from 'vite-tsconfig-paths';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(async ({ mode }) => {
    const { resolve } = path;
    const prod = mode === 'production';

    return {
        plugins: [svelte(), tsconfigPaths(), nodePolyfills()],

        build: {
            lib: {
                entry: resolve(__dirname, 'src/index.tsx'),
                name: 'main',
                fileName: () => 'main.js',
                formats: ['cjs'],
            },
            target: "es2020", // TODO drop to es2018, loses bigint
            minify: prod,
            sourcemap: prod ? false : 'inline',
            cssCodeSplit: false,
            emptyOutDir: false,
            outDir: '.',
            rollupOptions: {
                input: {
                    main: resolve(__dirname, 'src/index.tsx'),
                },
                external: [
                    "obsidian",
                    "electron",
                    "@codemirror/autocomplete",
                    "@codemirror/collab",
                    "@codemirror/commands",
                    "@codemirror/language",
                    "@codemirror/lint",
                    "@codemirror/search",
                    "@codemirror/state",
                    "@codemirror/view",
                    "@lezer/common",
                    "@lezer/highlight",
                    "@lezer/lr",
                    ...builtins,
                ],
            },
        },
    } satisfies UserConfig;
});