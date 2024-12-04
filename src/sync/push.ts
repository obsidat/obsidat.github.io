import { App, Notice, TFile } from "obsidian";
import { XRPC } from "@atcute/client";
import { Brand, ComAtprotoRepoApplyWrites, IoGithubObsidatFile } from "@atcute/client/lexicons";
import { paginatedListRecords, hashFileName, isCidMatching, detectMimeType, chunks } from "../utils";
import { MyPluginSettings } from "..";
import { getLocalFileRkey } from ".";
import { encryptFileContents, encryptFileName } from "../crypto-utils";

export async function doPush(agent: XRPC, app: App, settings: MyPluginSettings) {
    const currentDate = new Date();

    const collection = 'io.github.obsidat.file';

    // TODO: any way to only get rkeys?
    const remoteFiles = await paginatedListRecords(agent, settings.bskyHandle!, collection);

    const remoteFilesByRkey = Object.fromEntries(remoteFiles.map(file => [file.rkey, file.value]));

    const writes: Brand.Union<ComAtprotoRepoApplyWrites.Create | ComAtprotoRepoApplyWrites.Delete | ComAtprotoRepoApplyWrites.Update>[] = [];

    const localFileList = app.vault.getAllLoadedFiles();
    localFileList.splice(0, 1); // why?

    const notice = new Notice(`Synchronizing ${localFileList.length} files!`);

    const localFilesByRkey = Object.fromEntries(
        localFileList
            .filter(e => e instanceof TFile)
            // TODO is it safe to include passphrase here?
            .map(file => [
                hashFileName(getLocalFileRkey(file, settings)),
                {
                    ...file,
                    fileLastCreatedOrModified: Math.max(file.stat.ctime, file.stat.mtime),
                }
            ])
    );

    if (settings.deleteMissingRemoteFiles) {
        for (const [rkey, file] of Object.entries(remoteFilesByRkey)) {
            if (!(rkey in localFilesByRkey)) {
                writes.push({
                    $type: 'com.atproto.repo.applyWrites#delete',
                    collection,
                    rkey
                } satisfies Brand.Union<ComAtprotoRepoApplyWrites.Delete>);
            }
        }
    }

    for (const [rkey, file] of Object.entries(localFilesByRkey)) {
        if (rkey in remoteFilesByRkey) {
            const remoteFile = remoteFilesByRkey[rkey];

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

        if (rkey in remoteFilesByRkey) {
            const remoteFile = remoteFilesByRkey[rkey];

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
            $type: rkey in remoteFilesByRkey ? 'com.atproto.repo.applyWrites#update' : 'com.atproto.repo.applyWrites#create',
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

    notice.setMessage('Done!');
}