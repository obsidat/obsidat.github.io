import { App, Notice, TFile } from "obsidian";
import { paginatedListRecords, toMap } from "../utils";
import { XRPC } from "@atcute/client";
import { At } from "@atcute/client/lexicons";
import MyPlugin, { MyPluginSettings } from "..";
import { FileMetadata } from ".";
import { decryptBlob, decryptInlineData, downloadFileBlob } from "../utils/crypto-utils";
import { CaseInsensitiveMap } from "../utils/cim";
import { decode as decodeCbor, encode as encodeCbor } from 'cbor-x';
import { fromCbor } from "../utils/cbor";
import { getVaultMetadata } from "./vault-metadata";
import { XRPCEx } from "../utils/xrpc-ex";

export async function doPull(agent: XRPCEx, did: At.DID, plugin: MyPlugin) {
    const { app, settings } = plugin;

    const collection = 'io.github.obsidat.file';

    const vaultMetadata = await getVaultMetadata(agent, plugin);

    const vaultMetadataFilesByRkey = toMap(
        Object.entries(vaultMetadata.files),
        ([path, file]) => file.rkey,
        ([path, file]) => ({ path, ...file }),
    );

    const remoteFiles = await paginatedListRecords(agent, settings.bskyHandle!, collection);

    const remoteFilesByRkey = toMap(remoteFiles, file => file.rkey, file => file.value);

    const localFileList = app.vault.getAllLoadedFiles();
    localFileList.splice(0, 1); // why?

    const localFilesByRkey = toMap(
        localFileList.filter(e => e instanceof TFile),

        file => vaultMetadata.rkey + vaultMetadata.files[file.path].rkey,
        file => ({
            ...file,
            fileLastCreatedOrModified: Math.max(file.stat.ctime, file.stat.mtime),
        })
    );

    new Notice(`Pulling changes from remote repo @${settings.bskyHandle}...`);

    // TODO actually track file deletions instead of doing this?
    // if (settings.deleteMissingLocalFiles) {
    //     for (const [rkey, file] of localFilesByRkey.entries()) {
    //         if (!remoteFilesByRkey.has(rkey)) {
    //             await app.fileManager.trashFile(file);
    //         }
    //     }
    // }

    for (const [rkey, remoteFile] of remoteFilesByRkey.entries()) {
        const localFile = localFilesByRkey.get(rkey)!;

        const vaultMetadataFile = vaultMetadataFilesByRkey.get(rkey);
        if (!vaultMetadataFile) {
            console.warn(
                'race condition! another device is uploading while we are downloading,' +
                `and the vault record is not up to date. file rkey ${rkey} remoteFile`, remoteFile
            );
            continue;
        }

        const { vaultName, filePath, fileLastCreatedOrModified } = decodeCbor(
            await decryptInlineData(remoteFile.metadata, vaultMetadataFile.passphrase)
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