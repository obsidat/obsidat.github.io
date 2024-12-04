import { App, Notice, TFile, arrayBufferToBase64, base64ToArrayBuffer } from "obsidian";
import { decryptData, encryptData } from "../encryption";
import { paginatedListRecords, hashFileName, isCidMatching, detectMimeType, chunks, splitFirst } from "../utils";
import { XRPC } from "@atcute/client";
import { At, Brand, ComAtprotoRepoApplyWrites, IoGithubObsidatFile } from "@atcute/client/lexicons";
import { MyPluginSettings } from "..";
import { getLocalFileRkey } from ".";
import { decryptFileContents, decryptFileName, downloadFileContents } from "../crypto-utils";
import { CaseInsensitiveMap } from "../utils/cim";

export async function doPull(agent: XRPC, app: App, settings: MyPluginSettings, did: At.DID) {
    const collection = 'io.github.obsidat.file';

    // TODO: any way to only get rkeys?
    const remoteFiles = await paginatedListRecords(agent, settings.bskyHandle!, collection);

    const remoteFilesByRkey = CaseInsensitiveMap.toMap(remoteFiles, file => file.rkey, file => file.value);

    const localFileList = app.vault.getAllLoadedFiles();
    localFileList.splice(0, 1); // why?

    const localFilesByRkey = CaseInsensitiveMap.toMap(
        localFileList.filter(e => e instanceof TFile),

        file => hashFileName(getLocalFileRkey(file, settings)),
        file => ({
            ...file,
            fileLastCreatedOrModified: Math.max(file.stat.ctime, file.stat.mtime),
        })
    );

    new Notice(`Pulling changes from remote repo @${settings.bskyHandle}...`);

    if (settings.deleteMissingLocalFiles) {
        for (const [rkey, file] of localFilesByRkey.entries()) {
            if (!remoteFilesByRkey.has(rkey)) {
                await app.fileManager.trashFile(file);
            }
        }
    }

    for (const [rkey, remoteFile] of remoteFilesByRkey.entries()) {
        const localFile = localFilesByRkey.get(rkey)!;

        if (localFile) {
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
            did,
            agent,
            remoteFile
        );

        const fileData = await decryptFileContents(
            encryptedFileData,
            remoteFile,
            settings.passphrase
        );

        if (localFile) {
            await app.vault.modifyBinary(localFile, fileData, {
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

    new Notice(`Pulled down ${remoteFilesByRkey.size} files from @${settings.bskyHandle}.`);
}