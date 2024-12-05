<script lang="ts">
    import { ApiClient } from "../api-client";
    import path from 'path-browserify';
    import { makeUrl, markdownRender } from "../markdown-renderer";
    import { push, pop, replace } from 'svelte-spa-router'
    import { onMount } from "svelte";
    import inspect from 'browser-util-inspect';

    export let params: { handle: string; rkey: string; passphrase?: string };

    let handle: string;
    let rkey: string;
    let passphrase: string | undefined;
    let route: string;

    // svelte-spa-router does not re-mount the component when parameters change, so we need to use reactivity
    $: {
        handle = params.handle;
        rkey = params.rkey;
        passphrase = params.passphrase;
        route = location.hash.startsWith('#/page/') ? 'page' : 'private-page';
    }

    let htmlElement: HTMLElement;
    let title: string | undefined;
    let file: Awaited<ReturnType<ApiClient['getAndDecryptFile']>> | undefined = undefined;
    let textContent: string | undefined;
    let dom: DocumentFragment;

    let filePromise: ReturnType<ApiClient['getAndDecryptFile']>;

    $: {
        filePromise = ApiClient.create(params.handle)
            .then(client => client.getAndDecryptFile(params.rkey, params.passphrase))
            .then(result => file = result)

        filePromise
            .catch(err => console.error(err));
    }

    // add this as an onclick to anchor events to navigate to the page via the router instead
    function navigate(event: MouseEvent) {
        if (event.button !== 0) return;

        const href = (event.currentTarget as HTMLAnchorElement).href;
        if (href.includes('#/')) {
            event.preventDefault();
            push(href.slice(href.indexOf('#/')));
        }
    }
    
    $: {
        textContent = typeof file?.contents === 'string'
            ? file.contents
            : file?.mimeType.startsWith('text/')
                ? new TextDecoder().decode(file.contents)
                : undefined;
    }

    $: {        
        if (file && 'html' in file && file.html) {
            const template = document.createElement('template')
            template.innerHTML = file.html;
            dom = template.content;
        }
    }

    $: {
        if (dom && htmlElement) {
            htmlElement.append(dom);

            for (const anchor of htmlElement.getElementsByClassName('internal-link')) {
                const href = anchor.getAttribute('href');
                if (!href || href.includes('://')) continue;

                const realPath = makeUrl(file!.filePath, file!.vaultName, route, handle, decodeURI(href), passphrase);

                console.log(anchor, href, realPath);
                
                anchor.setAttribute('href', realPath);
                (anchor as HTMLAnchorElement).addEventListener('click', navigate);
            }
        }
    }

    $: {
        if (!dom && htmlElement && file && textContent) {
            const rendered = markdownRender(
                textContent,
                href => makeUrl(file!.filePath, file!.vaultName, route, handle, decodeURI(href), passphrase, file!.referencedFilePassphrases)
            );

            for (const anchor of rendered.element.querySelectorAll('a')) {
                if (anchor.href.includes('#')) {
                    anchor.addEventListener('click', navigate);
                }
            }

            if (rendered.frontmatterYaml) {
                const pre = document.createElement('pre');
                pre.style.overflowX = 'auto';
                pre.append(rendered.frontmatterYaml);
                htmlElement.append(pre);
            }
            htmlElement.append(rendered.element);
        }
    }
</script>

{#await filePromise}
    <p>Loading file from repo <a href="https://bsky.app/profile/{handle}">@{handle}</a></p>
{:then file} 
    {#if 'html' in file && file.html}
        <div class="obsidian-root">
            <h1>{path.basename(file.filePath, '.md')}</h1>
            <div bind:this={htmlElement} />
        </div>
    {:else if textContent}
        <div class="obsidian-root">
            <h1>{path.basename(file.filePath, '.md')}</h1>
            <div class="text-content">
                <div bind:this={htmlElement} />
            </div>
        </div>
    {/if}
{:catch err}
    <p>File load error:</p>
    <pre style="overflow-x: auto;">{inspect(err)}</pre>
{/await}

<style lang="scss">
    .container {
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif;
    }
</style>
