import { App, Notice, TFile } from "obsidian";
import { XRPC } from "@atcute/client";
import { Brand, ComAtprotoRepoApplyWrites, IoGithubObsidatFile } from "@atcute/client/lexicons";
import { paginatedListRecords, isCidMatching, chunks, hashToBase32 } from "../utils";
import { MyPluginSettings } from "..";
import { EncryptedMetadata, getLocalFileRkey, getPerFilePassphrase } from ".";
import { encryptBlob, encryptInlineData } from "../utils/crypto-utils";
import { CaseInsensitiveMap } from "../utils/cim";
import { decode as decodeCbor, encode as encodeCbor } from 'cbor-x';

const VERSION = 4;

export async function doPush(agent: XRPC, app: App, settings: MyPluginSettings) {
    const currentDate = new Date();

    const collection = 'io.github.obsidat.file';

    // TODO: any way to only get rkeys?
    const remoteFiles = await paginatedListRecords(agent, settings.bskyHandle!, collection);

    const remoteFilesByRkey = CaseInsensitiveMap.toMap(remoteFiles, file => file.rkey, file => file.value);

    const writes: Brand.Union<ComAtprotoRepoApplyWrites.Create | ComAtprotoRepoApplyWrites.Delete | ComAtprotoRepoApplyWrites.Update>[] = [];

    const localFileList = app.vault.getAllLoadedFiles();

    console.log(localFileList);
    localFileList.splice(0, 1); // why?

    const localFilesByRkey = CaseInsensitiveMap.toMap(
        localFileList.filter(e => e instanceof TFile),
        file => getLocalFileRkey(file, settings.passphrase),
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
                new Date(remoteFile.fileLastCreatedOrModified).getTime() >= file.fileLastCreatedOrModified) {
                // remote file is newer! dont overwrite!
                continue;
            }
        }

        const fileData = await file.vault.readBinary(file);

        const referencedFilePassphrases = app.metadataCache.resolvedLinks[file.path] ? Object.fromEntries(
            Object.entries(app.metadataCache.resolvedLinks[file.path])
                .map(([k]) => [k, [
                    getLocalFileRkey({ path: k, vaultName: file.vault.getName(), }, settings.passphrase),
                    getPerFilePassphrase({ path: k, vaultName: file.vault.getName(), }, settings.passphrase),
                ]])
        ) satisfies EncryptedMetadata['referencedFilePassphrases'] : undefined;

        const perFilePassPhrase = getPerFilePassphrase(rkey, settings.passphrase);

        const [encryptedFileData, encryptedFileMeta] = await Promise.all([
            // TODO encode passphrase in file properties (how would we do this for binary files?)
            encryptBlob(fileData, perFilePassPhrase),

            // TODO potentially check file paths for collisions
            encryptInlineData(encodeCbor({
                filePath: file.path,
                vaultName: file.vault.getName(),
                referencedFilePassphrases
            } satisfies EncryptedMetadata), perFilePassPhrase),
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
            recordCreatedAt: currentDate.toISOString(),
            fileLastCreatedOrModified: new Date(file.fileLastCreatedOrModified).toISOString(),
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