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
            textContent: file.mimeType.startsWith('text/')
                ? new TextDecoder().decode(file.contents)
                : undefined
        }));

</script>

<h1>Lorem ipsum</h1>
{#await filePromise}
    <p>Waiting for file</p>
{:then file} 
    <p>{file.filePath}</p>
    {#if file.textContent}
        {file.textContent}
    {/if}
{/await}

<style lang="scss">
    h1 {
        color: #008cff;
        text-transform: uppercase;
        font-size: 4em;
        font-weight: 100;
    }
</style>
