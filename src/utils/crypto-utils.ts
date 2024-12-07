import { XRPC } from "@atcute/client";
import { At, IoGithubObsidatFile, IoGithubObsidatPublicFile } from "@atcute/client/lexicons";
import { decryptData, encryptData } from "../encryption";
import { arrayBufferToBase64, base64ToArrayBuffer, splitFirst } from ".";
import { getPdsEndpoint, type DidDocument } from "@atcute/client/utils/did";
import { type TFile } from "obsidian";

export async function encryptBlob(data: ArrayBufferLike, ...passphrases: string[]): Promise<Blob> {
    const encryptedData = await encryptData(new Uint8Array(data), ...passphrases);

    return new Blob([encryptedData], { type: 'application/octet-stream' });
}

export async function encryptInlineData(data: ArrayBufferLike, ...passphrases: string[]): Promise<At.Bytes> {
    const encryptedData = await encryptData(
        new Uint8Array(data),
        ...passphrases
    );

    return {
        $bytes: arrayBufferToBase64(encryptedData),
    };
}

export async function decryptInlineData(data: At.Bytes, ...passphrases: string[]) {
    return await decryptData(base64ToArrayBuffer(data.$bytes), ...passphrases);
}

export async function downloadFileBlob(did: At.DID, agent: XRPC, remoteFile: IoGithubObsidatFile.Record | IoGithubObsidatPublicFile.Record) {
    const fileDataResponse = await agent.get('com.atproto.sync.getBlob', {
        params: {
            did,
            cid: 'payload' in remoteFile.body ? remoteFile.body.ref.$link : remoteFile.body.ref.$link
        }
    });

    return fileDataResponse.data;
}

export async function decryptBlob(data: Uint8Array, ...passphrases: string[]) {
    const fileData = await decryptData(data, ...passphrases);

    return fileData;
}
