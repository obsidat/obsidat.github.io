import { XRPC } from "@atcute/client";
import { At, IoGithubObsidatFile, IoGithubObsidatPublicFile } from "@atcute/client/lexicons";
import { decryptData, encryptData } from "../encryption";
import { arrayBufferToBase64, base64ToArrayBuffer, splitFirst } from ".";
import { getPdsEndpoint, type DidDocument } from "@atcute/client/utils/did";
import { type TFile } from "obsidian";
import { KeyAndSalt } from "../typage/recipients";

export async function encryptFileName(file: TFile, keyAndSalt: KeyAndSalt) {
    return await encryptInlineData(
        new TextEncoder().encode(`${file.vault.getName()}:${file.path}`),
        keyAndSalt
    );
}

export async function encryptInlineData(data: ArrayBufferLike, keyAndSalt: KeyAndSalt): Promise<At.Bytes> {
    const encryptedFilePath = await encryptData(
        new Uint8Array(data),
        keyAndSalt
    );

    return { $bytes: arrayBufferToBase64(encryptedFilePath.nonce), };
}

export async function decryptFileName(remoteFile: IoGithubObsidatFile.Record, key: Uint8Array): Promise<readonly [vaultName: string, filePath: string]> {
    const [vaultName, filePath] = await decryptAtBytes(remoteFile.path, key)
        .then(e => new TextDecoder().decode(e))
        .then(e => splitFirst(e, ':'));

    return [vaultName, filePath] as const;
}

export async function decryptAtBytes(data: At.Bytes, key: Uint8Array) {
    return await decryptData(base64ToArrayBuffer(data.$bytes), key);
}

export async function downloadFileContents(did: At.DID, agent: XRPC, remoteFile: IoGithubObsidatFile.Record | IoGithubObsidatPublicFile.Record) {
    const fileDataResponse = await agent.get('com.atproto.sync.getBlob', {
        params: {
            did,
            cid: 'payload' in remoteFile.body ? remoteFile.body.ref.$link : remoteFile.body.ref.$link
        }
    });

    return fileDataResponse.data;
}
