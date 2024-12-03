// https://github.com/progfay/html-tsx/blob/master/src/index.ts

import 'obsidian';

export declare namespace h {
    namespace JSX {
        type EmptyElementTagName = (keyof HTMLElementTagNameMap) & (
            | 'area'
            | 'base'
            | 'br'
            | 'col'
            | 'embed'
            | 'hr'
            | 'img'
            | 'input'
            // | 'keygen'
            | 'link'
            | 'meta'
            | 'param'
            | 'source'
            | 'track'
            | 'wbr'
        );

        // Reference: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts
        interface HTMLAttributes {
            // Standard HTML Attributes
            accesskey?: string;
            class?: string;
            contenteditable?: boolean | 'true' | 'false' | 'inherit';
            contextmenu?: string;
            dir?: string;
            draggable?: boolean | 'true' | 'false';
            hidden?: boolean;
            id?: string;
            lang?: string;
            placeholder?: string;
            slot?: string;
            spellcheck?: boolean | 'true' | 'false';
            style?: string;
            tabindex?: number;
            title?: string;
            translate?: 'yes' | 'no';

            // Unknown
            radiogroup?: string; // <command>, <menuitem>

            // All the WAI-ARIA 1.1 attributes from https://www.w3.org/TR/wai-aria-1.1/
            role?: string;
            'aria-activedescendant'?: string;
            'aria-atomic'?: boolean | 'false' | 'true';
            'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both';
            'aria-busy'?: boolean | 'false' | 'true';
            'aria-checked'?: boolean | 'false' | 'mixed' | 'true';
            'aria-colcount'?: number;
            'aria-colindex'?: number;
            'aria-colspan'?: number;
            'aria-controls'?: string;
            'aria-current'?: boolean | 'false' | 'true' | 'page' | 'step' | 'location' | 'date' | 'time';
            'aria-describedby'?: string;
            'aria-details'?: string;
            'aria-disabled'?: boolean | 'false' | 'true';
            'aria-dropeffect'?: 'none' | 'copy' | 'execute' | 'link' | 'move' | 'popup';
            'aria-errormessage'?: string;
            'aria-expanded'?: boolean | 'false' | 'true';
            'aria-flowto'?: string;
            'aria-grabbed'?: boolean | 'false' | 'true';
            'aria-haspopup'?: boolean | 'false' | 'true' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
            'aria-hidden'?: boolean | 'false' | 'true';
            'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling';
            'aria-keyshortcuts'?: string;
            'aria-label'?: string;
            'aria-labelledby'?: string;
            'aria-level'?: number;
            'aria-live'?: 'off' | 'assertive' | 'polite';
            'aria-modal'?: boolean | 'false' | 'true';
            'aria-multiline'?: boolean | 'false' | 'true';
            'aria-multiselectable'?: boolean | 'false' | 'true';
            'aria-orientation'?: 'horizontal' | 'vertical';
            'aria-owns'?: string;
            'aria-placeholder'?: string;
            'aria-posinset'?: number;
            'aria-pressed'?: boolean | 'false' | 'mixed' | 'true';
            'aria-readonly'?: boolean | 'false' | 'true';
            'aria-relevant'?: 'additions' | 'additions text' | 'all' | 'removals' | 'text';
            'aria-required'?: boolean | 'false' | 'true';
            'aria-roledescription'?: string;
            'aria-rowcount'?: number;
            'aria-rowindex'?: number;
            'aria-rowspan'?: number;
            'aria-selected'?: boolean | 'false' | 'true';
            'aria-setsize'?: number;
            'aria-sort'?: 'none' | 'ascending' | 'descending' | 'other';
            'aria-valuemax'?: number;
            'aria-valuemin'?: number;
            'aria-valuenow'?: number;
            'aria-valuetext'?: string;

            // RDFa Attributes
            about?: string;
            datatype?: string;
            inlist?: any;
            prefix?: string;
            property?: string;
            resource?: string;
            typeof?: string;
            vocab?: string;

            // Non-standard Attributes
            autocapitalize?: string;
            autocorrect?: string;
            autosave?: string;
            color?: string;
            itemprop?: string;
            itemscope?: boolean;
            itemtype?: string;
            itemid?: string;
            itemref?: string;
            results?: number;
            security?: string;
            unselectable?: 'on' | 'off';

            // Living Standard
            inputmode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
            is?: string;
        }

        type Properties<T extends keyof HTMLElementTagNameMap> = {
            readonly [K in keyof Omit<HTMLElementTagNameMap[T], 'children' | keyof HTMLAttributes>]?:
            HTMLElementTagNameMap[T][K] extends (string | boolean | number)
            ? HTMLElementTagNameMap[T][K]
            : never
        } & {
            readonly toString: () => string
            readonly children?: T extends EmptyElementTagName ? never : (string | string[])
        } & HTMLAttributes & {
            /** The parent element to be assigned to. */
            $parent?: Element;

            /** Prepend instead of appending. */
            $prepend?: boolean;
        };

        type IntrinsicElements = {
            [T in keyof HTMLElementTagNameMap]: Properties<T>
        };

        export type ComponentChild =
            | string
            | number
            | bigint
            | boolean
            | null
            | undefined
            | Node;
        export type ComponentChildren = ComponentChild[] | ComponentChild;
    }
}

// Reference: https://developer.mozilla.org/en-US/docs/Glossary/Empty_element
// @ts-expect-error not a complete set, TODO
const EMPTY_ELEMENT_LIST = new Set<keyof h.JSX.IntrinsicElements>([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    // 'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);

export function h<T extends keyof h.JSX.IntrinsicElements>(
    tagName: T,
    properties?: h.JSX.Properties<T> | null,
    ...children: h.JSX.ComponentChildren[]
): HTMLElementTagNameMap[T] {
    let el;

    const elementInfo = {
        cls: properties?.className ?? properties?.['class'],
        attr: properties ? {
            ...Object.fromEntries(
                Object.entries(properties)
                    .filter(
                        ([k, v]) => 
                            (
                                typeof v === 'number' ||
                                typeof v === 'string' ||
                                typeof v === 'boolean' ||
                                typeof v === 'undefined' ||
                                v === null
                            )
                            && !k.startsWith('$')
                    )
                    .map(([k, v]) => [k, v as (string | number | boolean | null)]),
            )
        } : {},
        prepend: properties?.$prepend,
    } satisfies DomElementInfo;

    if (properties && properties.$parent) {
        el = (properties.$parent as Node).createEl(tagName, elementInfo);
    } else {
        el = createEl(tagName, elementInfo);
    }

    if (!EMPTY_ELEMENT_LIST.has(tagName) && children.length > 0) {
        for (const child of children.flat()) {
            el.append(typeof child === 'object' && child !== null && 'nodeType' in child ? child : String(child));
        }
    }

    return el as HTMLElementTagNameMap[T];
}