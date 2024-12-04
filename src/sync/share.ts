import { App, Notice, TFile, arrayBufferToBase64 } from "obsidian";
import { encryptData } from "../encryption";
import { paginatedListRecords, hashFileName, isCidMatching, detectMimeType, chunks, toKeyValuePairs, ATMOSPHERE_CLIENT, toPageAndLinkCounts } from "../utils";
import { XRPC } from "@atcute/client";
import { Brand, ComAtprotoRepoApplyWrites, IoGithubObsidatFile, IoGithubObsidatPublicFile } from "@atcute/client/lexicons";
import { MyPluginSettings } from "..";

export async function doShare(agent: XRPC, app: App, settings: MyPluginSettings, files: string[]) {
    const currentDate = new Date();

    const collection = 'io.github.obsidat.publicFile';

    // TODO: any way to only get rkeys?
    const remoteFiles = await paginatedListRecords(agent, settings.bskyHandle!, collection);

    const remoteFilesByRkey = Object.fromEntries(remoteFiles.map(file => [file.rkey, file.value]));

    const writes: Brand.Union<ComAtprotoRepoApplyWrites.Create | ComAtprotoRepoApplyWrites.Delete | ComAtprotoRepoApplyWrites.Update>[] = [];

    const notice = new Notice(`Sharing ${files.length} files!`);

    const localFileList = files.map(file => app.vault.getAbstractFileByPath(file));

    const localFilesByRkey = Object.fromEntries(
        localFileList
            .filter(e => e instanceof TFile)
            .map(e => [
                hashFileName(`${e.path}:${e.vault.getName()}`),
                {
                    ...e,
                    fileLastCreatedOrModified: Math.max(e.stat.ctime, e.stat.mtime),
                }
            ])
    );

    for (const [rkey, file] of Object.entries(localFilesByRkey)) {
        if (file.extension === 'md' || file.extension === '.md') {
            app.fileManager.processFrontMatter(file, (frontmatter) => {
                frontmatter["share-url"] = `${ATMOSPHERE_CLIENT}/page/${settings.bskyHandle}/${rkey}`;
                console.log(frontmatter);
            });
        }

        const fileData = await file.vault.readBinary(file);

        if (rkey in remoteFilesByRkey) {
            const remoteFile = remoteFilesByRkey[rkey];

            if (fileData.byteLength === remoteFile.body.size && isCidMatching(fileData, remoteFile.body)) {
                // files are identical! dont upload!
                continue;
            }
        }

        const uploadBlobOutput = await agent.call('com.atproto.repo.uploadBlob', {
            data: new Blob([fileData], { type: detectMimeType(file.path) })
        });

        const fileCache = app.metadataCache.getFileCache(file);

        const value = {
            $type: 'io.github.obsidat.publicFile',
            body: uploadBlobOutput.data.blob,
            filePath: file.path,
            vaultName: file.vault.getName(),
            title: fileCache?.frontmatter?.title ?? fileCache?.frontmatter?.name,
            tags: fileCache?.tags?.map(e => e.tag) ?? fileCache?.frontmatter?.tags ?? fileCache?.frontmatter?.tag,
            aliases: fileCache?.frontmatter?.aliases ?? fileCache?.frontmatter?.alias,
            cover: fileCache?.frontmatter?.cover ?? fileCache?.frontmatter?.image,
            description: fileCache?.frontmatter?.description ?? fileCache?.frontmatter?.desc,
            resolvedLinks: toPageAndLinkCounts(app.metadataCache.resolvedLinks[file.path]),
            unresolvedLinks: toPageAndLinkCounts(app.metadataCache.unresolvedLinks[file.path]),
            frontmatter: toKeyValuePairs(fileCache?.frontmatter),
            recordCreatedAt: currentDate.toISOString(),
            fileLastCreatedOrModified: new Date(file.fileLastCreatedOrModified).toISOString(),
        } satisfies IoGithubObsidatPublicFile.Record;

        writes.push({
            $type: rkey in remoteFilesByRkey ? 'com.atproto.repo.applyWrites#update' : 'com.atproto.repo.applyWrites#create',
            collection,
            rkey,
            value
        } satisfies Brand.Union<ComAtprotoRepoApplyWrites.Update | ComAtprotoRepoApplyWrites.Create>);
    }

    for (const chunk of chunks(writes, 200)) {
        agent.call('com.atproto.repo.applyWrites', {
            data: {
                repo: settings.bskyHandle!,
                writes: chunk
            }
        })
    }

    notice.setMessage('Done!');
}