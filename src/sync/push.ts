import { App, Notice, TFile } from "obsidian";
import { XRPC } from "@atcute/client";
import { Brand, ComAtprotoRepoApplyWrites, IoGithubObsidatFile } from "@atcute/client/lexicons";
import { paginatedListRecords, isCidMatching, chunks, hashToBase32 } from "../utils";
import MyPlugin, { MyPluginSettings } from "..";
import { FileMetadata } from ".";
import { encryptBlob, encryptInlineData } from "../utils/crypto-utils";
import { CaseInsensitiveMap } from "../utils/cim";
import { decode as decodeCbor, encode as encodeCbor } from 'cbor-x';
import { getVaultMetadata } from "./vault-metadata";

const VERSION = 7;

export async function doPush(agent: XRPC, plugin: MyPlugin) {
    const { app, settings } = plugin;

    const uploadStartDate = new Date();

    const collection = 'io.github.obsidat.file';

    const vaultMetadata = await getVaultMetadata(agent, plugin);

    const remoteFiles = await paginatedListRecords(agent, settings.bskyHandle!, collection);

    const remoteFilesByRkey = CaseInsensitiveMap.toMap(remoteFiles, file => file.rkey, file => file.value);

    const writes: Brand.Union<ComAtprotoRepoApplyWrites.Create | ComAtprotoRepoApplyWrites.Delete | ComAtprotoRepoApplyWrites.Update>[] = [];

    const localFileList = app.vault.getAllLoadedFiles();

    console.log(localFileList);
    localFileList.splice(0, 1); // why?

    const localFilesByRkey = CaseInsensitiveMap.toMap(
        localFileList.filter(e => e instanceof TFile),
        file => vaultMetadata.files[file.path].rkey,
        file => ({
            ...file,
            fileLastCreatedOrModified: Math.max(file.stat.ctime, file.stat.mtime),
        })
    );

    console.log(localFilesByRkey);

    new Notice(`Synchronizing ${localFilesByRkey.size} files to remote repo @${settings.bskyHandle}...`);

    if (settings.deleteMissingRemoteFiles) {
        for (const [rkey, file] of remoteFilesByRkey.entries()) {
            if (localFilesByRkey.has(rkey)) {
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
                    vaultMetadata.files[k].rkey,
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

        const uploadBlobOutput = await agent.call('com.atproto.repo.uploadBlob', {
            data: encryptedFileData
        });

        const value = {
            $type: 'io.github.obsidat.file',
            body: uploadBlobOutput.data.blob,
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
        agent.call('com.atproto.repo.applyWrites', {
            data: {
                repo: settings.bskyHandle!,
                writes: chunk
            }
        })
    }

    new Notice(`Done synchronizing ${localFilesByRkey.size} files to remote repo @${settings.bskyHandle}.`);
}