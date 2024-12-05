
/*
 * renderer.ts
 *
 * This module exposes a function that turns an Obsidian markdown string into
 * an HTML string with as many inconsistencies ironed out as possible
 *
 */

import * as path from 'path';
import * as fs from 'fs';
import * as YAML from 'yaml';
import { Base64 } from 'js-base64';

import { App, FileSystemAdapter, MarkdownRenderer, MarkdownView, Notice } from 'obsidian';

import mathJaxFontCSS from './styles/mathjax-css';
import appCSS, { variables as appCSSVariables } from './styles/app-css';
import MyPlugin from '..';

export interface PandocPluginSettings {
    // Show a command like `pandoc -o Output.html -t html -f commonmark Input.md`
    //  in the UI as an example of how to do something similar in the terminal
    // showCLICommands: boolean;
    // When rendering internal [[wikilinks]], should we add a file extension?
    // eg turns <a href="file"> to <a href="file.extension">
    addExtensionsToInternalLinks: string,
    // Which default theme's CSS do we inject? (we only use a tiny subset - variables, basic styling)
    injectAppCSS: 'current' | 'none' | 'light' | 'dark',
    // Do we inject 3rd party theme CSS as well as the app's default CSS?
    // injectThemeCSS: boolean,
    // Use a custom local .css file?
    customCSSFile: string | null,
    // Do we want to display the YAML frontmatter in the output?
    displayYAMLFrontmatter: boolean,
    // Do we strip [[wikilinks]] entirely, turn them into normal text, or leave them as links, or leave them as raw [[wikilinks]]?
    linkStrippingBehaviour: 'strip' | 'text' | 'link' | 'unchanged',
    // Do we render SVGs at 2x the size?
    highDPIDiagrams: boolean,
    // Custom Pandoc & LaTeX binary paths (useful for PATH variable issues)
    // pandoc: string | null,
    // pdflatex: string | null,
    // Output folder - if unspecified exports are saved next to where they were exported from
    // The path is absolute
    // outputFolder: string | null,
    // Extra CLI arguments for Pandoc to support features we don't have a UI for yet
    // extraArguments: string,
    // Export from HTML or from markdown?
    // exportFrom: 'html' | 'md',
}

export class MyMarkdownRenderer {
    constructor(
        private app: App,
        private plugin: MyPlugin,
        private settings: PandocPluginSettings,
    ) {}

    vaultBasePath(): string {
        return (this.app.vault.adapter as FileSystemAdapter).getBasePath();
    }

    // Note: parentFiles is for internal use (to prevent recursively embedded notes)
    // inputFile must be an absolute file path
    async render(
        view: MarkdownView, markdown: string, inputFile: string, outputFormat: string = 'html', parentFiles: string[] = []
    ): Promise<{ html: string, metadata: { [index: string]: string } }>
    {
        // Use Obsidian's markdown renderer to render to a hidden <div>
        const wrapper = document.createElement('div');
        wrapper.style.display = 'hidden';
        document.body.appendChild(wrapper);
        await MarkdownRenderer.render(this.app, markdown, wrapper, path.dirname(inputFile), view);

        // Post-process the HTML in-place
        await this.postProcessRenderedHTML(inputFile, wrapper, outputFormat,
            parentFiles, await this.mermaidCSS(this.vaultBasePath()));

        let html = wrapper.innerHTML;
        document.body.removeChild(wrapper);

        // If it's a top level note, make the HTML a standalone document - inject CSS, a <title>, etc.
        const metadata = this.getYAMLMetadata(markdown);
        metadata.title ??= this.fileBaseName(inputFile);
        if (parentFiles.length === 0) {
            html = await this.standaloneHTML(html, metadata.title, this.vaultBasePath());
        }

        return { html, metadata };
    }

    // Takes any file path like '/home/oliver/zettelkasten/Obsidian.md' and
    // takes the base name, in this case 'Obsidian'
    fileBaseName(file: string): string {
        return path.basename(file, path.extname(file));
    }

    getYAMLMetadata(markdown: string) {
        markdown = markdown.trim();
        if (markdown.startsWith('---')) {
            const trailing = markdown.substring(3);
            const frontmatter = trailing.substring(0, trailing.indexOf('---')).trim();
            return YAML.parse(frontmatter);
        }
        return {};
    }

    async getCustomCSS(vaultBasePath: string): Promise<string> {
        if (!this.settings.customCSSFile) return '';
        let file = this.settings.customCSSFile;

        let buffer: Buffer | null = null;

        // Try absolute path
        try {
            let test = await fs.promises.readFile(file);
            buffer = test;
        } catch(e) { }

        // Try relative path
        try {
            let test = await fs.promises.readFile(path.join(vaultBasePath, file));
            buffer = test;
        } catch(e) { }

        if(!buffer) {
            new Notice('Failed to load custom Pandoc CSS file: ' + this.settings.customCSSFile);
            return '';
        } else {
            return buffer.toString();
        }
    }

    async getAppConfig(vaultBasePath: string): Promise<any> {
        return JSON.parse((await fs.promises.readFile(path.join(vaultBasePath, '.obsidian', 'config'))).toString());
    }

    async currentThemeIsLight(vaultBasePath: string, config: any = null): Promise<boolean> {
        try {
            if (!config) config = await this.getAppConfig(vaultBasePath);
            return config.theme !== 'obsidian';
        } catch (e) {
            return true;
        }
    }

    async mermaidCSS(vaultBasePath: string): Promise<string> {
        // We always inject CSS into Mermaid diagrams, using light theme if the user has requested no CSS
        //   otherwise the diagrams look terrible. The output is a PNG either way
        let light = true;
        if (this.settings.injectAppCSS === 'dark') light = false;
        if (this.settings.injectAppCSS === 'current') {
            light = await this.currentThemeIsLight(vaultBasePath);
        }
        return appCSSVariables(light);
    }

    // Gets a small subset of app CSS and 3rd party theme CSS if desired
    async getThemeCSS(vaultBasePath: string): Promise<string> {
        if (this.settings.injectAppCSS === 'none') return '';
        try {
            const config = await this.getAppConfig(vaultBasePath);
            let light = await this.currentThemeIsLight(vaultBasePath, config);
            if (this.settings.injectAppCSS === 'light') light = true;
            if (this.settings.injectAppCSS === 'dark') light = false;
            return appCSS(light);
        } catch (e) {
            return '';
        }
    }

    async getDesiredCSS(html: string, vaultBasePath: string): Promise<string> {
        let css = await this.getThemeCSS(vaultBasePath);
        if (this.settings.injectAppCSS !== 'none') {
            css += ' ' + Array.from(document.querySelectorAll('style'))
                .map(s => s.innerHTML).join(' ');
        }
        // Inject MathJax font CSS if needed (at this stage embedded notes are
        //  already embedded so doesn't duplicate CSS)
        if (html.indexOf('jax="CHTML"') !== -1)
            css += ' ' + mathJaxFontCSS;
        // Inject custom local CSS file if it exists
        css += await this.getCustomCSS(vaultBasePath);
        return css;
    }

    async standaloneHTML(html: string, title: string, vaultBasePath: string): Promise<string> {
        // Wraps an HTML fragment in a proper document structure
        //  and injects the page's CSS
        const css = await this.getDesiredCSS(html, vaultBasePath);

        return `<!doctype html>\n` +
            `<html>\n` +
            `    <head>\n` +
            `        <title>${title}</title>\n` +
            `        <meta charset='utf-8'/>\n` +
            `        <style>\n${css}\n</style>\n` +
            `    </head>\n` +
            `    <body>\n` +
            `${html}\n` +
            `    </body>\n` +
            `</html>`;
    }

    async postProcessRenderedHTML(
        inputFile: string, wrapper: HTMLElement, outputFormat: string, parentFiles: string[] = [], css: string = ''
    )
    {
        const dirname = path.dirname(inputFile);
        const adapter = this.plugin.app.vault.adapter as FileSystemAdapter;

        // Fix <span src="image.png">
        for (let span of Array.from(wrapper.querySelectorAll('span[src$=".png"], span[src$=".jpg"], span[src$=".gif"], span[src$=".jpeg"]'))) {
            span.innerHTML = '';
            span.outerHTML = span.outerHTML.replace(/span/g, 'img');
        }
        // Fix <span class='internal-embed' src='another_note_without_extension'>
        for (let span of Array.from(wrapper.querySelectorAll('span.internal-embed'))) {
            let src = span.getAttribute('src');
            if (src) {
                const subfolder = inputFile.substring(adapter.getBasePath().length);  // TODO: this is messy
                const file = this.plugin.app.metadataCache.getFirstLinkpathDest(src, subfolder)!;
                try {
                    if (parentFiles.indexOf(file.path) !== -1) {
                        // We've got an infinite recursion on our hands
                        // We should replace the embed with a wikilink
                        // Then our link processing happens afterwards
                        span.outerHTML = `<a href="${file}">${span.innerHTML}</a>`;
                    } else {
                        const markdown = await adapter.read(file.path);
                        const newParentFiles = [...parentFiles];
                        newParentFiles.push(inputFile);
                        // TODO: because of this cast, embedded notes won't be able to handle complex plugins (eg DataView)
                        const html = await this.render({ data: markdown } as MarkdownView, markdown, file.path, outputFormat, newParentFiles);
                        span.outerHTML = html.html;
                    }
                } catch (e) {
                    // Continue if it can't be loaded
                    console.error(`Pandoc plugin encountered an error trying to load an embedded note: ${e}`);
                }
            }
        }

        // Fix <a href="app://obsidian.md/markdown_file_without_extension">
        const prefix = 'app://obsidian.md/';
        for (let a of Array.from(wrapper.querySelectorAll('a'))) {
            if (!a.href.startsWith(prefix)) continue;
            // This is now an internal link (wikilink)
            if (this.settings.linkStrippingBehaviour === 'link' || outputFormat === 'html') {
                let href = path.join(dirname, a.href.substring(prefix.length));
                if (this.settings.addExtensionsToInternalLinks.length && a.href.startsWith(prefix)) {
                    if (path.extname(href) === '') {
                        const dir = path.dirname(href);
                        const base = path.basename(href);
                        // Be careful to turn [[note#heading]] into note.extension#heading not note#heading.extension
                        const hashIndex = base.indexOf('#');
                        if (hashIndex !== -1) {
                            href = path.join(dir, base.substring(0, hashIndex) + '.' + this.settings.addExtensionsToInternalLinks + base.substring(hashIndex));
                        } else {
                            href = path.join(dir, base + '.' + this.settings.addExtensionsToInternalLinks);
                        }
                    }
                }
                a.href = href;
            } else if (this.settings.linkStrippingBehaviour === 'strip') {
                a.outerHTML = '';
            } else if (this.settings.linkStrippingBehaviour === 'text') {
                a.outerHTML = a.innerText;
            } else if (this.settings.linkStrippingBehaviour === 'unchanged') {
                a.outerHTML = `[[${a.outerHTML}]]`;
            }
        }

        // Fix <img src="app://obsidian.md/image.png">
        // Note: this will throw errors when Obsidian tries to load images with a (now invalid) src
        // These errors can be safely ignored
        if (outputFormat !== 'html') {
            for (let img of Array.from(wrapper.querySelectorAll('img'))) {
                if (img.src.startsWith(prefix) && img.getAttribute('data-touched') !== 'true') {
                    img.src = adapter.getFullPath(img.src.substring(prefix.length));
                    img.setAttribute('data-touched', 'true');
                }
            }
        }

        // Remove YAML frontmatter from the output if desired
        if (!this.settings.displayYAMLFrontmatter) {
            Array.from(wrapper.querySelectorAll('.frontmatter, .frontmatter-container'))
                .forEach(el => wrapper.removeChild(el));
        }
        
        // Fix Mermaid.js diagrams
        for (let svg of Array.from(wrapper.querySelectorAll('svg'))) {
            // Insert the CSS variables as a CSS string (even if the user doesn't want CSS injected; Mermaid diagrams look terrible otherwise)
            // TODO: it injects light theme CSS, do we want this?
            let style: HTMLStyleElement = svg.querySelector('style') || svg.appendChild(document.createElement('style'));
            style.innerHTML += css;
            // Inject a marker (arrowhead) for Mermaid.js diagrams and use it at the end of paths
            svg.innerHTML += `"<marker id="mermaid_arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="strokeWidth" markerWidth="8" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowheadPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker>"`;
            svg.innerHTML = svg.innerHTML.replace(/app:\/\/obsidian\.md\/index\.html#arrowhead\d*/g, "#mermaid_arrowhead");
            // If the output isn't HTML, replace the SVG with a PNG for compatibility
            if (outputFormat !== 'html') {
                const scale = this.settings.highDPIDiagrams ? 2 : 1;
                const png = await this.convertSVGToPNG(svg, scale);
                svg.parentNode!.replaceChild(png, svg);
            }
        }
    }

    // This creates an unmounted <img> element with a transparent background PNG data URL as the src
    // The scale parameter is used for high DPI renders (the <img> element size is the same,
    //  but the underlying PNG is higher resolution)
    convertSVGToPNG(svg: SVGSVGElement, scale: number = 1): Promise<HTMLImageElement> {
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(svg.width.baseVal.value * scale);
        canvas.height = Math.ceil(svg.height.baseVal.value * scale);
        const ctx = canvas.getContext('2d')!;
        var svgImg = new Image();
        svgImg.src = `data:image/svg+xml;base64,${Base64.encode(svg.outerHTML)}`;
        return new Promise((resolve, reject) => {
            svgImg.onload = () => {
                ctx.drawImage(svgImg, 0, 0, canvas.width, canvas.height);
                const pngData = canvas.toDataURL('png');
                const img = document.createElement('img');
                img.src = pngData;
                img.width = Math.ceil(svg.width.baseVal.value);
                img.height = Math.ceil(svg.height.baseVal.value);
                resolve(img);
            };
        });
    }
}
