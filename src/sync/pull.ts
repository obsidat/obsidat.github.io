import { App, Notice, TFile } from "obsidian";
import { hashToBase32, paginatedListRecords } from "../utils";
import { XRPC } from "@atcute/client";
import { At } from "@atcute/client/lexicons";
import MyPlugin, { MyPluginSettings } from "..";
import { FileMetadata } from ".";
import { decryptBlob, decryptInlineData, downloadFileBlob } from "../utils/crypto-utils";
import { CaseInsensitiveMap } from "../utils/cim";
import { decode as decodeCbor, encode as encodeCbor } from 'cbor-x';
import { fromCbor } from "../utils/cbor";
import { getVaultMetadata } from "./vault-metadata";

export async function doPull(agent: XRPC, did: At.DID, plugin: MyPlugin) {
    const { app, settings } = plugin;

    const collection = 'io.github.obsidat.file';

    const vaultMetadata = await getVaultMetadata(agent, plugin);

    // TODO: any way to only get rkeys?
    const remoteFiles = await paginatedListRecords(agent, settings.bskyHandle!, collection);

    const remoteFilesByRkey = CaseInsensitiveMap.toMap(remoteFiles, file => file.rkey, file => file.value);

    const localFileList = app.vault.getAllLoadedFiles();
    localFileList.splice(0, 1); // why?

    const localFilesByRkey = CaseInsensitiveMap.toMap(
        localFileList.filter(e => e instanceof TFile),

        file => vaultMetadata.files[file.path].rkey,
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

        // TODO potentially check file paths for collisions
        const { vaultName, filePath, fileLastCreatedOrModified } = decodeCbor(
            await decryptInlineData(remoteFile.metadata, settings.passphrase)
        ) as FileMetadata;

        if (localFile) {
            if (settings.dontOverwriteNewFiles &&
                localFile.fileLastCreatedOrModified >= new Date(fileLastCreatedOrModified).getTime() ) {
                // local file is newer! dont overwrite!
                continue;
            }
        }

        if (app.vault.getName() !== vaultName) {
            // vault mismatch!
            continue;
        }

        // TODO encode passphrase in file properties (how would we do this for binary files?)
        const encryptedFileData = await downloadFileBlob(
            did,
            agent,
            remoteFile
        );

        const fileData = await decryptBlob(
            encryptedFileData,
            settings.passphrase
        );

        if (localFile) {
            await app.vault.modifyBinary(localFile, fileData, {
                mtime: new Date(fileLastCreatedOrModified).getTime()
            });
        } else {
            // TODO need to create parent folder?

            await app.vault.createBinary(filePath, fileData, {
                ctime: new Date(fileLastCreatedOrModified).getTime(),
                mtime: new Date(fileLastCreatedOrModified).getTime()
            });
        }
    }

    new Notice(`Pulled down ${remoteFilesByRkey.size} files from @${settings.bskyHandle}.`);
}