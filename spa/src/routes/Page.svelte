<script lang="ts">
    import { hashFileName } from "@parent/utils";
    import { ApiClient } from "../api-client";
    import path from 'path-browserify';

    export let params: { handle: string; rkey: string; passphrase?: string };

    const handle = params.handle;
    const rkey = params.rkey;
    const passphrase = params.passphrase;

    let htmlElement: HTMLElement;
    let title: string | undefined;
    let file: Awaited<ReturnType<ApiClient['getAndDecryptFile']>> | undefined = undefined;
    let textContent: string | undefined;
    let dom: Document | undefined;

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
        dom = file && 'html' in file && file.html
            ? new DOMParser().parseFromString(file.html, 'text/html')
            : undefined;
    }

    $: {
        if (dom && htmlElement && dom.body.parentElement !== htmlElement) {
            // this isn't supposed to be here, and its inline styles break everything!
            const copyCodeButton = [...dom.getElementsByClassName('copy-code-button')];
            copyCodeButton.forEach(el => el.remove());
            
            for (const anchor of dom.body.getElementsByClassName('internal-link')) {
                const href = anchor.getAttribute('href');
                if (!href || href.includes('://')) continue;

                let realPath = path.resolve(path.dirname(file!.filePath), decodeURI(href) + '.md');
                
                // strip leading slashes
                realPath = realPath.replace(/^\/+/, '');

                console.log(anchor, href, realPath);
                
                // TODO passphrase support here
                anchor.setAttribute('href', `#/page/${handle}/${hashFileName(`${realPath}:${file!.vaultName}`)}`);
            }

            htmlElement.append(...dom.body.childNodes);
        }
    }
</script>

<div class="container">
    {#await filePromise}
            <style>
            body {
                background-color: var(--bg-color) !important;
                
                color: var(--text-color) !important;
                margin: 1rem !important;
                max-width: 75ch !important;
                font: var(--desktop-font-size) -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto, Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji", "Segoe UI Symbol" !important;
            }
            </style>
        <p>Loading file from repo @{handle}</p>
    {:then file} 
        {#if 'html' in file && file.html}
            <style>
            body {
                margin: 1rem !important;

                text-rendering: optimizeLegibility !important;
                font-family: var(--default-font) !important;
                line-height: 1.5em !important;
                font-size: 16px !important;
                background-color: var(--background-primary) !important;
                color: var(--text-normal) !important;
            }
            </style>
            <div class="notion-root">
                <h1>{path.basename(file.filePath, '.md')}</h1>
                <div bind:this={htmlElement} />
            </div>
        {:else if textContent}
            <div class="vanilla-root">
                <h1>{path.basename(file.filePath, '.md')}</h1>
                <div class="text-content">
                    {textContent}
                </div>
            </div>
        {/if}
    {:catch err}
        <p>File load error:</p>
        <pre>{err}</pre>
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
