import { XRPC, XRPCError } from "@atcute/client";
import { getVaultRkey, VaultMetadata } from ".";
import MyPlugin, { MyPluginSettings } from "..";
import { App, TFile } from "obsidian";
import { IoGithubObsidatVault } from "@atcute/client/lexicons";
import { decryptInlineData, encryptInlineData } from "../utils/crypto-utils";
import { decode as decodeCbor, encode as encodeCbor } from "cbor-x";
import { randomBytes } from "@noble/hashes/utils";
import { toBase32 } from "../utils";

export async function getVaultMetadata(agent: XRPC, plugin: MyPlugin) {
    const { app, settings } = plugin;

    const collection = 'io.github.obsidat.vault';

    const vaultRkey = settings.vaultMetadataCache.vaultRkey ??= await getVaultRkey(app.vault.getName(), settings.passphrase);

    let recordExists = false;
    let vault: IoGithubObsidatVault.Record | undefined;

    try {
        const { data: { value }} = await agent.get('com.atproto.repo.getRecord', {
            params: {
                repo: settings.bskyHandle!,
                collection,
                rkey: vaultRkey
            }
        });

        vault = value as IoGithubObsidatVault.Record;
        const existingMeta = decodeCbor(
            await decryptInlineData(vault.metadata, settings.passphrase)
        ) as VaultMetadata;

        // update file data from upstream
        Object.assign(settings.vaultMetadataCache.files, existingMeta.files);

        recordExists = true;
    } catch (err) {
        if (!(err instanceof XRPCError) || err.kind !== 'RecordNotFound') {
            throw err;
        }
    }

    for (const file of app.vault.getAllLoadedFiles()) {
        if (!(file instanceof TFile)) continue;
        if (file.path in settings.vaultMetadataCache) continue; // TODO incrementally update the metadata instead

        settings.vaultMetadataCache.files[file.path] = {
            passphrase: toBase32(randomBytes(32)),
            rkey: toBase32(randomBytes(16)),
        };
    }

    await plugin.saveSettings();

    vault ??= {
        $type: 'io.github.obsidat.vault',
        metadata: undefined!,
        name: app.vault.getName(),
        recordCreatedAt: new Date().toISOString(),
        vaultCreatedAt: new Date().toISOString(), // TODO
    };

    vault.metadata = await encryptInlineData(
        encodeCbor(settings.vaultMetadataCache),
        settings.passphrase
    );

    await agent.call('com.atproto.repo.putRecord', {
        data: {
            repo: settings.bskyHandle!,
            collection,
            rkey: vaultRkey,
            record: vault,
        }
    });

    return settings.vaultMetadataCache;
}