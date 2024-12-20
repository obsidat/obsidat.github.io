import { CredentialManager, XRPC } from '@atcute/client';
import type { At, IoGithubObsidatFile, IoGithubObsidatPublicFile } from '@atcute/client/lexicons';
import { getActorInfo } from '@parent/api-utils';
import { decryptBlob, downloadFileBlob, decryptInlineData } from '@parent/utils/crypto-utils';
import { detectMimeType } from '@parent/utils';
import { decode as decodeCbor } from 'cbor-x';
import type { FileMetadata } from '@parent/sync';
import { fromCbor } from '@parent/utils/cbor';
import { KittyAgent } from '@parent/utils/kitty-agent';

export class ApiClient {
    private constructor(
        private readonly did: At.DID,
        private readonly handle: string,
        private readonly pdsAgent: KittyAgent,
    ) {}

    static async create(handle: string) {
        const manager = new CredentialManager({ service: 'https://bsky.social' });
        const agent = new KittyAgent({ handler: manager });
        
        const actorInfo = await getActorInfo(agent, handle);

        return new ApiClient(actorInfo.did, actorInfo.handle ?? handle, actorInfo.pdsAgent);
    }

    async getFile(rkey: string, passphrase?: undefined): Promise<{ uri: string; value: IoGithubObsidatPublicFile.Record; }>;
    async getFile(rkey: string, passphrase: string): Promise<{ uri: string; value: IoGithubObsidatFile.Record; }>
    
    async getFile(rkey: string, passphrase?: string): Promise<{ uri: string; value: (IoGithubObsidatFile.Record | IoGithubObsidatPublicFile.Record); }> {
        const output = await this.pdsAgent.get({
            collection: passphrase !== undefined ? 'io.github.obsidat.file' : 'io.github.obsidat.publicFile',
            repo: this.did,
            rkey
        });
    
        return {
            uri: output.uri,
            value: output.value as (IoGithubObsidatFile.Record | IoGithubObsidatPublicFile.Record)
        };
    }
    
    async getAndDecryptFile(rkey: string, passphrase?: string) {
        if (passphrase !== undefined) {
            const { uri, value: file } = await this.getFile(rkey, passphrase);
    
            const { vaultName, filePath, referencedFilePassphrases, fileLastCreatedOrModified } = decodeCbor(
                await decryptInlineData(file.metadata, passphrase)
            ) as FileMetadata;
            const encryptedContents = await downloadFileBlob(this.did, this.pdsAgent, file);
            const contents = await decryptBlob(encryptedContents, passphrase);
    
            return {
                vaultName,
                filePath,
                contents,
                uri,
                mimeType: detectMimeType(filePath),
                fileLastCreatedOrModified,
                recordCreatedAt: new Date(file.recordCreatedAt),
                referencedFilePassphrases
            };
        } else {
            const { uri, value: file } = await this.getFile(rkey);
            const contents = await downloadFileBlob(this.did, this.pdsAgent, file);
    
            return {
                ...file,
                contents,
                uri,
                mimeType: file.body.mimeType,
                fileLastCreatedOrModified: new Date(file.fileLastCreatedOrModified),
                recordCreatedAt: new Date(file.recordCreatedAt),
            };
        }
    }
}
