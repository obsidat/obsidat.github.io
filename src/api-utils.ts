import { CredentialManager, XRPC } from "@atcute/client";
import { DidDocument, getPdsEndpoint } from "@atcute/client/utils/did";
import { getDid, getHandle } from "./utils";
import { At } from "@atcute/client/lexicons";

export interface ActorInfo {
    pdsEndpoint?: string;
    did: At.DID;
    handle?: string;
    pdsAgent: XRPC;
}

export async function getActorInfo(agent: XRPC, didOrHandle: string): Promise<ActorInfo> {
    const describeRepoResponse = await agent.get('com.atproto.repo.describeRepo', {
        params: {
            repo: didOrHandle
        }
    });

    const didDoc = describeRepoResponse.data.didDoc as DidDocument | undefined;

    const pdsEndpoint = didDoc ? getPdsEndpoint(didDoc) : undefined;
    let did = didDoc ? getDid(didDoc) : undefined;
    const handle = didDoc ? getHandle(didDoc) : undefined;

    if (!did) {
        const didResponse = !didOrHandle.startsWith('did:')
            ? await agent.get('com.atproto.identity.resolveHandle', {
                params: {
                    handle: didOrHandle
                }
            })
            : {
                data: {
                    did: handle as At.DID
                }
            };

        did = didResponse.data.did;
    }

    const pdsAgent = pdsEndpoint ? new XRPC({
        handler: new CredentialManager({
            service: pdsEndpoint
        })
    }) : agent;

    return {
        pdsEndpoint,
        did,
        handle,
        pdsAgent
    };
}