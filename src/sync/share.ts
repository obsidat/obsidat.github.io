import { App, Notice, TFile, arrayBufferToBase64 } from "obsidian";
import { encryptData } from "../encryption";
import { paginatedListRecords, hashFileName, isCidMatching, detectMimeType, chunks, toKeyValuePairs, ATMOSPHERE_CLIENT, toPageAndLinkCounts } from "../utils";
import { XRPC } from "@atcute/client";
import { Brand, ComAtprotoRepoApplyWrites, IoGithubObsidatFile, IoGithubObsidatPublicFile } from "@atcute/client/lexicons";
import { MyPluginSettings } from "..";
import { CaseInsensitiveMap } from "../utils/cim";

export async function doShare(agent: XRPC, app: App, settings: MyPluginSettings, files: string[]) {
    const currentDate = new Date();

    const collection = 'io.github.obsidat.publicFile';

    // TODO: any way to only get rkeys?
    const remoteFiles = await paginatedListRecords(agent, settings.bskyHandle!, collection);

    const remoteFilesByRkey = CaseInsensitiveMap.toMap(remoteFiles, file => file.rkey, file => file.value);

    const writes: Brand.Union<ComAtprotoRepoApplyWrites.Create | ComAtprotoRepoApplyWrites.Delete | ComAtprotoRepoApplyWrites.Update>[] = [];

    new Notice(`Sharing ${files.length} files to @${settings.bskyHandle}...`);

    const localFileList = files.map(file => app.vault.getAbstractFileByPath(file));

    const localFilesByRkey = CaseInsensitiveMap.toMap(
        localFileList.filter(e => e instanceof TFile),
        file => hashFileName(`${file.path}:${file.vault.getName()}`),
        file => ({
            ...file,
            fileLastCreatedOrModified: Math.max(file.stat.ctime, file.stat.mtime),
        })
    );

    for (const [rkey, file] of localFilesByRkey.entries()) {
        if (file.extension === 'md' || file.extension === '.md') {
            console.log(`processing frontmatter for ${file.path}`);
            app.fileManager.processFrontMatter(file, (frontmatter) => {
                frontmatter["share-url"] = `${ATMOSPHERE_CLIENT}/page/${settings.bskyHandle}/${rkey}`;
            });
            console.log(`processed frontmatter for ${file.path}`);
        }

        const fileData = await file.vault.readBinary(file);

        const remoteFile = remoteFilesByRkey.get(rkey);

        if (remoteFile) {
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
            $type: remoteFile ? 'com.atproto.repo.applyWrites#update' : 'com.atproto.repo.applyWrites#create',
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

    new Notice(`Shared ${files.length} files to @${settings.bskyHandle}`);
}