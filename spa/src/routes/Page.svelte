<script lang="ts">
    import { hashFileName } from "@parent/utils";
    import { ApiClient } from "../api-client";
    import path from 'path-browserify';
    import { makeUrl, markdownRender } from "../markdown-renderer";

    export let params: { handle: string; rkey: string; passphrase?: string };

    const handle = params.handle;
    const rkey = params.rkey;
    const passphrase = params.passphrase;
    const route = location.hash.startsWith('#/page/') ? 'page' : 'private-page';

    let htmlElement: HTMLElement;
    let title: string | undefined;
    let file: Awaited<ReturnType<ApiClient['getAndDecryptFile']>> | undefined = undefined;
    let textContent: string | undefined;
    let dom: DocumentFragment;

    const filePromise = ApiClient.create(handle)
        .then(client => client.getAndDecryptFile(rkey, passphrase))
        .then(afile => file = afile);
    
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
                
                // TODO passphrase support here
                anchor.setAttribute('href', realPath);
            }
        }
    }

    $: {
        if (!dom && htmlElement && file && textContent) {
            const rendered = markdownRender(
                textContent,
                href => makeUrl(file!.filePath, file!.vaultName, route, handle, decodeURI(href), passphrase)
            );

            if (rendered.frontmatterYaml) {
                const pre = document.createElement('pre');
                pre.style.overflowX = 'scroll';
                pre.append(rendered.frontmatterYaml);
                htmlElement.append(pre);
            }
            htmlElement.append(rendered.element);
        }
    }
</script>

<div class="container">
    {#await filePromise}
        <p>Loading file from repo @{handle}</p>
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
        <pre style="overflow-x: scroll;">{err}</pre>
    {/await}
</div>

<style lang="scss">
    body {
        background-color: var(--bg-color);
    }

    .container {
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif;
    }
</style>
