// https://github.com/binyamin/eleventy-garden/blob/77be371da872f14adb827e707b49101920aafaec/.eleventy.js

/*!
MIT License

Copyright (c) 2020 Binyamin Aron Green

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import markdownIt, { type Options as MarkdownItOptions } from 'markdown-it';
import markdownItAttrs from 'markdown-it-attrs';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItLatex from 'markdown-it-latex';
import { parse as parseYaml } from 'yaml';
import path from 'path-browserify';
import { hashFileName } from '@parent/utils';
import { getLocalFileRkey, getPublicFileRkey } from '@parent/sync';

export function makeUrl(currentFile: string, currentVault: string, route: string, handle: string, filePath: string, passphrase?: string) {
    if (filePath.includes('://')) return filePath;

    let realPath = path.resolve(path.dirname(currentFile), decodeURI(filePath) + '.md');
    
    // strip leading slashes
    realPath = realPath.replace(/^\/+/, '');

    console.log(filePath, realPath);
    
    const url = `#/${route}/${handle}/${hashFileName(
        passphrase
            ? getLocalFileRkey({ path: realPath, vaultName: currentVault }, passphrase)
            : getPublicFileRkey({ path: realPath, vaultName: currentVault })
    )}${passphrase ? `/${passphrase}` : ''}`;

    return url;
}

export function markdownRender(markdown: string, makeUrl: (path: string) => string) {
    const markdownItOptions = {
        html: true,
        linkify: true
    } satisfies MarkdownItOptions;

    let frontmatterYaml: string | undefined;
    let frontmatter: any | undefined;
    
    markdown = markdown.trim();
    if (markdown.startsWith('---')) {
        const trailing = markdown.slice(3);
        frontmatterYaml = trailing.slice(0, trailing.indexOf('---')).trim();
        
        frontmatter = parseYaml(frontmatterYaml);

        markdown = markdown.slice(markdown.indexOf('---', 3) + 3).trim();
    }

    const md = markdownIt(markdownItOptions)
        .use(markdownItFootnote)
        .use(markdownItAttrs)
        .use(markdownItLatex)
        // .use(markdownItFrontMatter)
        .use(md => {
            // Recognize Mediawiki links ([[text]])
            md.linkify.add("[[", {
                validate: /^\s?([^\[\]\|\n\r]+)(\|[^\[\]\|\n\r]+)?\s?\]\]/,
                normalize(match) {
                    const parts = match.raw.slice(2,-2).split("|");
                    parts[0] = parts[0].replace(/.(md|markdown)\s?$/i, "");
                    match.text = (parts[1] || parts[0]).trim();
                    
                    // TODO replace /notes/ internal links
                    match.url = makeUrl(parts[0].trim());
                }
            })
        });

    const html = md.render(markdown);

    const tempEl = document.createElement('template');
    tempEl.innerHTML = html;
    return { element: tempEl.content, frontmatterYaml, frontmatter };
}