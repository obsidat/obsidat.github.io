import { App, Notice, TFile } from "obsidian";
import { XRPC } from "@atcute/client";
import { Brand, ComAtprotoRepoApplyWrites, IoGithubObsidatFile } from "@atcute/client/lexicons";
import { paginatedListRecords, hashFileName, isCidMatching, detectMimeType, chunks } from "../utils";
import { MyPluginSettings } from "..";
import { getLocalFileRkey } from ".";
import { encryptFileContents, encryptFileName } from "../crypto-utils";
import { CaseInsensitiveMap } from "../utils/cim";

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
        file => hashFileName(getLocalFileRkey(file, settings)),
        file => ({
            ...file,
            fileLastCreatedOrModified: Math.max(file.stat.ctime, file.stat.mtime),
        })
    );

    console.log(localFilesByRkey);

    new Notice(`Synchronizing ${Object.keys(localFilesByRkey).length} files to remote repo @${settings.bskyHandle}...`);

    if (settings.deleteMissingRemoteFiles) {
        for (const [rkey, file] of Object.entries(remoteFilesByRkey)) {
            if (localFilesByRkey.has(rkey)) {
                writes.push({
                    $type: 'com.atproto.repo.applyWrites#delete',
                    collection,
                    rkey
                } satisfies Brand.Union<ComAtprotoRepoApplyWrites.Delete>);
            }
        }
    }

    for (const [rkey, file] of Object.entries(localFilesByRkey)) {
        const remoteFile = remoteFilesByRkey.get(rkey);

        if (remoteFile) {
            if (settings.dontOverwriteNewFiles &&
                new Date(remoteFile.fileLastCreatedOrModified).getTime() >= file.fileLastCreatedOrModified) {
                // remote file is newer! dont overwrite!
                continue;
            }
        }

        const fileData = await file.vault.readBinary(file);

        const [encryptedFileData, encryptedFilePath] = await Promise.all([
            // TODO encode passphrase in file properties (how would we do this for binary files?)
            encryptFileContents(fileData, settings.passphrase),

            // TODO potentially check file paths for collisions
            encryptFileName(file, settings.passphrase),
        ]);

        if (remoteFile) {
            if (encryptedFileData.payload.byteLength === remoteFile.body.payload.size &&
                isCidMatching(encryptedFileData.payload, remoteFile.body.payload)) {
                // files are identical! dont upload!
                continue;
            }
        }

        const uploadBlobOutput = await agent.call('com.atproto.repo.uploadBlob', {
            data: new Blob([encryptedFileData.payload], { type: 'application/octet-stream' })
        });

        const value = {
            $type: 'io.github.obsidat.file',
            body: {
                ...encryptedFileData.recordBody,
                payload: uploadBlobOutput.data.blob,
            },
            path: encryptedFilePath,
            recordCreatedAt: currentDate.toISOString(),
            fileLastCreatedOrModified: new Date(file.fileLastCreatedOrModified).toISOString(),
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

    new Notice(`Done synchronizing ${Object.keys(localFilesByRkey).length} files to remote repo @${settings.bskyHandle}.`);
}