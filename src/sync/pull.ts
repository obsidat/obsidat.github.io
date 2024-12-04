import { App, Notice, TFile, arrayBufferToBase64, base64ToArrayBuffer } from "obsidian";
import { decryptData, encryptData } from "../encryption";
import { paginatedListRecords, hashFileName, isCidMatching, detectMimeType, chunks, splitFirst } from "../utils";
import { XRPC } from "@atcute/client";
import { At, Brand, ComAtprotoRepoApplyWrites, IoGithubObsidatFile } from "@atcute/client/lexicons";
import { MyPluginSettings } from "..";
import { getLocalFileRkey } from ".";
import { decryptFileContents, decryptFileName, downloadFileContents } from "../crypto-utils";

export async function doPull(agent: XRPC, app: App, settings: MyPluginSettings, did: At.DID) {
    const collection = 'io.github.obsidat.file';

    // TODO: any way to only get rkeys?
    const remoteFiles = await paginatedListRecords(agent, settings.bskyHandle!, collection);

    const remoteFilesByRkey = Object.fromEntries(remoteFiles.map(file => [file.rkey, file.value]));

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

    if (settings.deleteMissingLocalFiles) {
        for (const [rkey, file] of Object.entries(localFilesByRkey)) {
            if (!(rkey in remoteFilesByRkey)) {
                await app.fileManager.trashFile(file);
            }
        }
    }

    for (const [rkey, remoteFile] of Object.entries(remoteFilesByRkey)) {
        if (rkey in localFilesByRkey) {
            const localFile = localFilesByRkey[rkey];

            if (settings.dontOverwriteNewFiles &&
                localFile.fileLastCreatedOrModified >= new Date(remoteFile.fileLastCreatedOrModified).getTime() ) {
                // local file is newer! dont overwrite!
                continue;
            }
        }

        // TODO potentially check file paths for collisions
        const [vaultName, filePath] = await decryptFileName(remoteFile, settings.passphrase);

        if (app.vault.getName() !== vaultName) {
            // vault mismatch!
            continue;
        }

        // TODO encode passphrase in file properties (how would we do this for binary files?)
        const encryptedFileData = await downloadFileContents(
            settings.bskyHandle!,
            agent,
            remoteFile
        );

        const fileData = await decryptFileContents(
            encryptedFileData,
            remoteFile,
            settings.passphrase
        );

        if (rkey in localFilesByRkey) {
            await app.vault.modifyBinary(localFilesByRkey[rkey], fileData, {
                mtime: new Date(remoteFile.fileLastCreatedOrModified).getTime()
            });
        } else {
            // TODO need to create parent folder?

            await app.vault.createBinary(filePath, fileData, {
                ctime: new Date(remoteFile.fileLastCreatedOrModified).getTime(),
                mtime: new Date(remoteFile.fileLastCreatedOrModified).getTime()
            });
        }
    }

    notice.setMessage('Done!');
}