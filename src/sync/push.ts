import { App, Notice, TFile } from "obsidian";
import { XRPC } from "@atcute/client";
import type { Brand, ComAtprotoRepoApplyWrites, IoGithubObsidatFile } from "@atcute/client/lexicons";
import { paginatedListRecords, isCidMatching, chunks, toMap, rkey } from "../utils";
import MyPlugin, { type MyPluginSettings } from "..";
import type { FileMetadata } from ".";
import { encryptBlob, encryptInlineData } from "../utils/crypto-utils";
import { CaseInsensitiveMap } from "../utils/cim";
import { decode as decodeCbor, encode as encodeCbor } from 'cbor-x';
import { getVaultMetadata } from "./vault-metadata";
import { XRPCEx } from "../utils/xrpc-ex";
import type { KittyAgent } from "../utils/kitty-agent";

const VERSION = 7;

export async function doPush(agent: KittyAgent, plugin: MyPlugin) {
    const { app, settings } = plugin;

    const uploadStartDate = new Date();

    const collection = 'io.github.obsidat.file';

    const vaultMetadata = await getVaultMetadata(agent, plugin);

    const { records: remoteFiles } = await agent.paginatedList({
        repo: settings.bskyHandle!,
        collection
    });

    const remoteFilesByRkey = toMap(
        remoteFiles,
        file => rkey(file), file => file.value
    );

    const writes: Brand.Union<
        ComAtprotoRepoApplyWrites.Create | ComAtprotoRepoApplyWrites.Delete | ComAtprotoRepoApplyWrites.Update
    >[] = [];

    const localFileList = app.vault.getAllLoadedFiles();

    console.log(localFileList);
    localFileList.splice(0, 1); // why?

    const localFilesByRkey = toMap(
        localFileList.filter(e => e instanceof TFile),
        file => vaultMetadata.rkey + vaultMetadata.files[file.path].rkey,
        file => ({
            ...file,
            fileLastCreatedOrModified: Math.max(file.stat.ctime, file.stat.mtime),
        })
    );

    console.log(localFilesByRkey);

    new Notice(`Synchronizing ${localFilesByRkey.size} files to remote repo @${settings.bskyHandle}...`);

    // TODO actually track file deletions instead of doing this?
    if (settings.deleteMissingRemoteFiles) {
        for (const [rkey, file] of remoteFilesByRkey.entries()) {
            if (!localFilesByRkey.has(rkey)) {
                writes.push({
                    $type: 'com.atproto.repo.applyWrites#delete',
                    collection,
                    rkey
                } satisfies Brand.Union<ComAtprotoRepoApplyWrites.Delete>);
            }
        }
    }

    for (const [rkey, file] of localFilesByRkey.entries()) {
        const remoteFile = remoteFilesByRkey.get(rkey);

        const remoteVersion = remoteFile?.version ?? -1;

        if (remoteFile && remoteVersion >= VERSION) {
            if (settings.dontOverwriteNewFiles &&
                new Date(remoteFile.recordCreatedAt) >= uploadStartDate) {
                // remote file is newer! dont overwrite!
                continue;
            }
        }

        const fileData = await file.vault.readBinary(file);

        const referencedFilePassphrases = app.metadataCache.resolvedLinks[file.path] ? Object.fromEntries(
            Object.entries(app.metadataCache.resolvedLinks[file.path])
                .map(([k]) => [k, [
                    vaultMetadata.rkey + vaultMetadata.files[k].rkey,
                    vaultMetadata.files[k].passphrase,
                ]])
        ) satisfies FileMetadata['referencedFilePassphrases'] : undefined;

        const perFilePassphrase = vaultMetadata.files[file.path].passphrase;

        const [encryptedFileData, encryptedFileMeta] = await Promise.all([
            encryptBlob(fileData, perFilePassphrase),

            encryptInlineData(encodeCbor({
                filePath: file.path,
                vaultName: file.vault.getName(),
                referencedFilePassphrases,
                fileLastCreatedOrModified: new Date(file.fileLastCreatedOrModified),
            } satisfies FileMetadata), perFilePassphrase),
        ]);

        if (remoteFile && remoteVersion >= VERSION) {
            if (encryptedFileData.size === remoteFile.body.size &&
                isCidMatching(await encryptedFileData.arrayBuffer(), remoteFile.body)) {
                // files are identical! dont upload!
                continue;
            }
        }

        const blob = await agent.uploadBlob(encryptedFileData);

        const value = {
            $type: 'io.github.obsidat.file',
            body: blob,
            metadata: encryptedFileMeta,
            recordCreatedAt: new Date().toISOString(),
            version: VERSION,
        } satisfies IoGithubObsidatFile.Record;

        writes.push({
            $type: remoteFile ? 'com.atproto.repo.applyWrites#update' : 'com.atproto.repo.applyWrites#create',
            collection,
            rkey,
            value
        } satisfies Brand.Union<ComAtprotoRepoApplyWrites.Update | ComAtprotoRepoApplyWrites.Create>);
    }

    for (const chunk of chunks(writes, 200)) {
        await agent.batchWrite({
            repo: settings.bskyHandle!,
            writes: chunk
        });
    }

    new Notice(`Done synchronizing ${localFilesByRkey.size} files to remote repo @${settings.bskyHandle}.`);
}