import { XRPC } from "@atcute/client";
import { At, IoGithubObsidatFile, IoGithubObsidatPublicFile } from "@atcute/client/lexicons";
import { decryptData, encryptData } from "../encryption";
import { arrayBufferToBase64, base64ToArrayBuffer, splitFirst } from ".";
import { getPdsEndpoint, type DidDocument } from "@atcute/client/utils/did";
import { type TFile } from "obsidian";
import { KeyAndSalt } from "../typage/recipients";

export async function encryptFileContents(data: ArrayBufferLike, keyAndSalt: KeyAndSalt): Promise<{
    payload: Uint8Array,
    recordBody: Omit<IoGithubObsidatFile.EncryptedData, 'payload'>,
}> {
    // TODO encode passphrase in file properties (how would we do this for binary files?)
    const encryptedFileData = await encryptData(
        new Uint8Array(data), keyAndSalt
    );

    return {
        payload: encryptedFileData.payload,
        recordBody: {
            header: encryptedFileData.header,
            nonce: {
                $bytes: arrayBufferToBase64(encryptedFileData.nonce),
            }
        },
    }
}

export async function encryptFileName(file: TFile, keyAndSalt: KeyAndSalt):
    Promise<IoGithubObsidatFile.InlineEncryptedData>
{
    return await encryptInlineData(
        new TextEncoder().encode(`${file.vault.getName()}:${file.path}`),
        keyAndSalt
    );
}

export async function encryptInlineData(data: ArrayBufferLike, keyAndSalt: KeyAndSalt):
    Promise<IoGithubObsidatFile.InlineEncryptedData>
{
    const encryptedFilePath = await encryptData(
        new Uint8Array(data),
        keyAndSalt
    );

    return {
        header: encryptedFilePath.header,
        nonce: {
            $bytes: arrayBufferToBase64(encryptedFilePath.nonce),
        },
        payload: {
            $bytes: arrayBufferToBase64(encryptedFilePath.payload),
        },
    }
}

export async function decryptFileName(remoteFile: IoGithubObsidatFile.Record, key: Uint8Array): Promise<readonly [vaultName: string, filePath: string]> {
    const [vaultName, filePath] = await decryptInlineData(remoteFile.path, key)
        .then(e => new TextDecoder().decode(e))
        .then(e => splitFirst(e, ':'));

    return [vaultName, filePath] as const;
}

export async function decryptInlineData(data: At.Bytes, key: Uint8Array) {
    return await decryptData({
        header: data.header,
        nonce: base64ToArrayBuffer(data.nonce.$bytes),
        payload: base64ToArrayBuffer(data.payload.$bytes),
    }, key);
}

export async function downloadFileContents(did: At.DID, agent: XRPC, remoteFile: IoGithubObsidatFile.Record | IoGithubObsidatPublicFile.Record) {
    const fileDataResponse = await agent.get('com.atproto.sync.getBlob', {
        params: {
            did,
            cid: 'payload' in remoteFile.body ? remoteFile.body.payload.ref.$link : remoteFile.body.ref.$link
        }
    });

    return fileDataResponse.data;
}

export async function decryptFileContents(data: Uint8Array, remoteFile: IoGithubObsidatFile.Record, key: Uint8Array) {
    const fileData = await decryptData({
        header: remoteFile.body.header,
        nonce: base64ToArrayBuffer(remoteFile.body.nonce.$bytes),
        payload: data,
    }, passphrase);

    return fileData;
}
