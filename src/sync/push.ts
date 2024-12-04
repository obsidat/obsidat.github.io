import { App, Notice, TFile, arrayBufferToBase64 } from "obsidian";
import { encryptData } from "../encryption";
import { paginatedListRecords, hashFileName, isCidMatching, detectMimeType, chunks } from "../utils";
import { XRPC } from "@atcute/client";
import { Brand, ComAtprotoRepoApplyWrites, IoGithubObsidatFile } from "@atcute/client/lexicons";
import { MyPluginSettings } from "..";

// TODO: maybe wanna make this per-repo? or is that unnecessary?
const STATIC_SALT = arrayBufferToBase64(new Uint8Array([0x5b, 0x5b, 0xe4, 0x8b, 0x43, 0x0d, 0x6d, 0x0f, 0x41, 0xb2, 0x34, 0x93, 0x7f, 0x26, 0x1c, 0x6b, 0xff, 0x49, 0x3b, 0x62, 0x9a, 0x21, 0x94, 0xee, 0x71, 0x5e, 0x91, 0xec, 0xe9, 0x38, 0x1f, 0x12, 0xa8, 0xdd, 0xfa, 0xe4, 0xcf, 0xf5, 0x28, 0xdd, 0xb4, 0x2e, 0x98, 0xd9, 0xd1 ]));

export function getLocalFileRkey(file: TFile, settings: MyPluginSettings) {
    return `${file.path}:${file.vault.getName()}:${settings.passphrase}:${STATIC_SALT}`;
}

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
                new Date(remoteFile.fileLastCreatedOrModified).getTime() > file.fileLastCreatedOrModified) {
                // remote file is newer! dont overwrite!
                continue;
            }
        }

        const fileData = await file.vault.readBinary(file);

        const [encryptedFileData, encryptedFilePath] = await Promise.all([
            // TODO encode passphrase in file properties (how would we do this for binary files?)
            encryptData(new Uint8Array(fileData), settings.passphrase),

            // TODO potentially check file paths for collisions
            encryptData(new TextEncoder().encode(`${file.vault.getName()}:${file.path}`), settings.passphrase),
        ]);

        if (rkey in remoteFilesByRkey) {
            const remoteFile = remoteFilesByRkey[rkey];

            if (encryptedFileData.payload.byteLength === remoteFile.body.payload.size && isCidMatching(encryptedFileData.payload, remoteFile.body.payload)) {
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
                header: encryptedFileData.header,
                nonce: {
                    $bytes: arrayBufferToBase64(encryptedFileData.nonce),
                },
                payload: uploadBlobOutput.data.blob,
            },
            path: {
                header: encryptedFilePath.header,
                nonce: {
                    $bytes: arrayBufferToBase64(encryptedFilePath.nonce),
                },
                payload: {
                    $bytes: arrayBufferToBase64(encryptedFilePath.payload),
                },
            },
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