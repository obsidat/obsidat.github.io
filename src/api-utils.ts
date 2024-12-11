import { CredentialManager, XRPC } from "@atcute/client";
import { type DidDocument, getPdsEndpoint } from "@atcute/client/utils/did";
import { getDid, getHandle } from "./utils";
import type { At } from "@atcute/client/lexicons";
import { KittyAgent } from "./utils/kitty-agent";

export interface ActorInfo {
    pdsEndpoint?: string;
    did: At.DID;
    handle?: string;
    pdsAgent: KittyAgent;
}

export async function getActorInfo(agent: KittyAgent, didOrHandle: string): Promise<ActorInfo> {
    const describeRepoResponse = await agent.query('com.atproto.repo.describeRepo', {
        repo: didOrHandle
    });

    const didDoc = describeRepoResponse.didDoc as DidDocument | undefined;

    const pdsEndpoint = didDoc ? getPdsEndpoint(didDoc) : undefined;
    let did = didDoc ? getDid(didDoc) : undefined;
    const handle = didDoc ? getHandle(didDoc) : undefined;

    if (!did) {
        const didResponse = !didOrHandle.startsWith('did:')
            ? await agent.query('com.atproto.identity.resolveHandle', {
                handle: didOrHandle
            })
            : {
                did: handle as At.DID
            };

        did = didResponse.did;
    }

    const pdsAgent = pdsEndpoint ? new KittyAgent(new XRPC({
        handler: new CredentialManager({
            service: pdsEndpoint
        })
    })) : agent;

    return {
        pdsEndpoint,
        did,
        handle,
        pdsAgent
    };
}