import { XRPC } from "@atcute/client";
import { At, IoGithubObsidatFile, IoGithubObsidatPublicFile } from "@atcute/client/lexicons";
import { fromBase64 as base64ToArrayBuffer } from '@smithy/util-base64';
import { decryptData } from "./encryption";
import { splitFirst } from "./utils";
import { getPdsEndpoint, type DidDocument } from "@atcute/client/utils/did";

export async function decryptFileName(remoteFile: IoGithubObsidatFile.Record, passphrase: string): Promise<readonly [vaultName: string, filePath: string]> {
    const [vaultName, filePath] = await decryptData({
        header: remoteFile.path.header,
        nonce: base64ToArrayBuffer(remoteFile.path.nonce.$bytes),
        payload: base64ToArrayBuffer(remoteFile.path.payload.$bytes),
    }, passphrase)
        .then(e => new TextDecoder().decode(e))
        .then(e => splitFirst(e, ':'));

    return [vaultName, filePath] as const;
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

export async function decryptFileContents(data: Uint8Array, remoteFile: IoGithubObsidatFile.Record, passphrase: string) {
    const fileData = await decryptData({
        header: remoteFile.body.header,
        nonce: base64ToArrayBuffer(remoteFile.body.nonce.$bytes),
        payload: data,
    }, passphrase);

    return fileData;
}
