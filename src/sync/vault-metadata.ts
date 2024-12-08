import { XRPC, XRPCError } from "@atcute/client";
import { getVaultRkey, VaultMetadata } from ".";
import MyPlugin, { MyPluginSettings } from "..";
import { App, TFile } from "obsidian";
import { IoGithubObsidatVault } from "@atcute/client/lexicons";
import { decryptInlineData, encryptInlineData } from "../utils/crypto-utils";
import { decode as decodeCbor, encode as encodeCbor } from "cbor-x";
import { randomBytes } from "@noble/hashes/utils";
import { toBase58 } from "../utils";

async function tryGetVaultMetadata(agent: XRPC, plugin: MyPlugin, vaultRkey: string) {
    const { app, settings } = plugin;

    const collection = 'io.github.obsidat.vault';

    let vault: IoGithubObsidatVault.Record | undefined;
    let existingCid: string | undefined;

    try {
        const { data: { value, cid }} = await agent.get('com.atproto.repo.getRecord', {
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

        existingCid = existingCid;
    } catch (err) {
        if (!(err instanceof XRPCError) || err.kind !== 'RecordNotFound') {
            throw err;
        }
    }

    for (const file of app.vault.getAllLoadedFiles()) {
        if (!(file instanceof TFile)) continue;
        if (file.path in settings.vaultMetadataCache) continue; // TODO incrementally update the metadata instead

        settings.vaultMetadataCache.files[file.path] = {
            passphrase: toBase58(randomBytes(32)),
            rkey: toBase58(randomBytes(16)),
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

    try {
        await agent.call('com.atproto.repo.putRecord', {
            data: {
                repo: settings.bskyHandle!,
                collection,
                rkey: vaultRkey,
                record: vault,
                swapRecord: existingCid,
            }
        });
        return true;
    } catch (err) {
        if (!(err instanceof XRPCError) || err.kind !== 'InvalidSwap') {
            throw err;
        }
        return false;
    }
}

export async function getVaultMetadata(agent: XRPC, plugin: MyPlugin) {
    const { app, settings } = plugin;

    const vaultRkey = settings.vaultMetadataCache.vaultRkey ??= await getVaultRkey(app.vault.getName(), settings.passphrase);

    let retries = 10;
    while (--retries) {
        if (await tryGetVaultMetadata(agent, plugin, vaultRkey)) break;
    }
    if (retries <= 0) throw new Error('failed to sync vault metadata in 10 attempts');

    return settings.vaultMetadataCache;
}