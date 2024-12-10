import { XRPC, XRPCError } from "@atcute/client";
import type { getVaultRkey, VaultMetadata, Vaults } from ".";
import MyPlugin, { type MyPluginSettings } from "..";
import { App, TFile } from "obsidian";
import type { IoGithubObsidatVault, IoGithubObsidatVaults } from "@atcute/client/lexicons";
import { decryptInlineData, encryptInlineData } from "../utils/crypto-utils";
import { decode as decodeCbor, encode as encodeCbor } from "cbor-x";
import { randomBytes } from "@noble/hashes/utils";
import { toBase58 } from "../utils";
import { isInvalidSwapError, XRPCEx } from "../utils/xrpc-ex";
import { now as tidNow } from '@atcute/tid';
import { KittyAgent } from "../utils/kitty-agent";

async function tryGetVaultMetadata(agent: KittyAgent, plugin: MyPlugin) {
    const { app, settings } = plugin;

    const collection = 'io.github.obsidat.vault';

    let { value: vault, cid } = await agent.tryGet({
        repo: settings.bskyHandle!,
        collection,
        rkey: settings.vaultRkey!
    });

    if (vault) {
        const existingMeta = decodeCbor(
            await decryptInlineData(vault.metadata, settings.passphrase)
        ) as VaultMetadata;

        console.log('found existing vault record with meta', existingMeta);

        // update file data from upstream
        Object.assign(settings.vaultMetadataCache.files, existingMeta.files);
    } else {
        console.log('did not find vault record, creating new');
    }

    // NB: since all this is async, there could be a race condition where doPush/doPull operate on a different
    // file list than this. this will cause a TypeError. you can simply restart the upload, so i don't care.
    for (const file of app.vault.getAllLoadedFiles()) {
        if (!(file instanceof TFile)) continue;

        settings.vaultMetadataCache.files[file.path] ??= {
            passphrase: toBase58(randomBytes(20)),
            rkey: tidNow(),
        };
    }

    await plugin.saveSettings();

    return await agent.trySwap({
        repo: settings.bskyHandle!,
        collection,
        rkey: settings.vaultRkey!,
        record: {
            $type: 'io.github.obsidat.vault',
            vaultCreatedAt: new Date().toISOString(), // TODO

            ...vault, // override vaultCreatedAt
            
            recordCreatedAt: new Date().toISOString(),
            metadata: await encryptInlineData(
                encodeCbor(settings.vaultMetadataCache),
                settings.passphrase
            ),
            name: app.vault.getName(),
        },
        swapRecord: cid,
    });
}

async function tryFindOrAddVaultToVaults(agent: KittyAgent, plugin: MyPlugin) {
    const { app, settings } = plugin;

    let { value, cid } = await agent.tryGet({
        repo: settings.bskyHandle!,
        collection: 'io.github.obsidat.vaults',
        rkey: 'self'
    });

    const vaults = value?.vaults ? decodeCbor(
        await decryptInlineData(value.vaults, settings.passphrase)
    ) as Vaults : {
        vaults: []
    } satisfies Vaults;

    let vaultRkey = settings.vaultRkey ?? tidNow();

    const existingVault = vaults.vaults.find(vault =>
        vault.rkey === settings.vaultRkey! ||
        vault.name === app.vault.getName()
    );
    if (!existingVault) {
        vaults.vaults.push({
            rkey: vaultRkey,
            name: app.vault.getName()
        });
    } else {
        vaultRkey = existingVault.rkey;
    }

    console.log(`found existing vault`, existingVault);

    // no need to update, we already have a vault listed
    if (settings.vaultRkey === vaultRkey && existingVault) {
        console.log(`not pushing vault as existing vault exists`);
        return vaultRkey;
    }

    if (await agent.trySwap({
        repo: settings.bskyHandle!,
        collection: 'io.github.obsidat.vaults',
        rkey: 'self',
        record: {
            $type: 'io.github.obsidat.vaults',
            createdAt: new Date().toISOString(),
            vaults: await encryptInlineData(
                encodeCbor(vaults),
                settings.passphrase
            ),
        },
        swapRecord: cid,
    })) {
        return vaultRkey;
    }

    return undefined;
}

async function findOrAddVaultToVaults(agent: KittyAgent, plugin: MyPlugin) {
    let vaultRkey: string | undefined;

    let retries = 10;
    while (--retries) {
        if (vaultRkey = await tryFindOrAddVaultToVaults(agent, plugin)) break;
    }
    if (retries <= 0) throw new Error('failed to sync vault list in 10 attempts');

    return vaultRkey!;
}

export async function getVaultMetadata(agent: KittyAgent, plugin: MyPlugin) {
    const { app, settings } = plugin;

    settings.vaultRkey ??= await findOrAddVaultToVaults(agent, plugin);
    await plugin.saveSettings();

    let retries = 10;
    while (--retries) {
        if (await tryGetVaultMetadata(agent, plugin)) break;
    }
    if (retries <= 0) throw new Error('failed to sync vault metadata in 10 attempts');

    return { ...settings.vaultMetadataCache, rkey: settings.vaultRkey };
}