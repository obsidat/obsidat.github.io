<script lang="ts">
    import { ApiClient } from "../api-client";

    export let params: { handle: string; rkey: string; passphrase?: string };

    const handle = params.handle;
    const rkey = params.rkey;
    const passphrase = params.passphrase;

    const filePromise = ApiClient.create(handle)
        .then(client => client.getAndDecryptFile(rkey, passphrase))
        .then(file => ({
            ...file,
            textContent: typeof file.contents === 'string'
                ? file.contents
                : file.mimeType.startsWith('text/')
                    ? new TextDecoder().decode(file.contents)
                    : undefined
        }));

</script>

<div class="container">
    {#await filePromise}
        <p>Loading file from repo @{handle}</p>
    {:then file} 
        <h1>{file.filePath}</h1>
        {#if file.textContent}
            <div class="text-content">
                {file.textContent}
            </div>
        {/if}
    {:catch err}
        <p>File load error:</p>
        <pre>{err}</pre>
    {/await}
</div>

<style lang="scss">
    .container {
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif;
    }

    .text-content {
        white-space: pre;
    }
</style>
