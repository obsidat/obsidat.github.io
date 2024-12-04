/*!
https://github.com/stripedpajamas/case-insensitive-map

MIT License

Copyright (c) 2019 Peter Squicciarini

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

function confirmStringKey(key: unknown): key is string {
    if (typeof key !== 'string') {
        throw new Error('map keys must be strings')
    }
    return true;
}

function casefold(s: string) {
    return s.toLowerCase();
}

export class CaseInsensitiveMap<V> extends Map<string, V> {
    static toMap<T>(entries: T[], getKey: (entry: T) => string): CaseInsensitiveMap<T>;
    static toMap<V, T>(entries: T[], getKey: (entry: T) => string, getValue: (entry: T) => V): CaseInsensitiveMap<V>;
    static toMap<V, T>(entries: T[], getKey: (entry: T) => string, getValue?: (entry: T) => V): CaseInsensitiveMap<V | T> {
        return getValue
            ? new CaseInsensitiveMap(entries.map(entry => [casefold(getKey(entry)), getValue(entry)]), true)
            : new CaseInsensitiveMap(entries.map(entry => [casefold(getKey(entry)), entry]), true);
    }
    constructor(entries?: readonly (readonly [string, V])[] | null, entriesAreNormalized = false) {
        super(
            entriesAreNormalized
                ? entries
                : entries
                    ?.map(([k, v]) => [casefold(k), v])
        );
    }
    set(key: string, val: V) {
        confirmStringKey(key);
        return super.set(casefold(key), val);
    }
    get(key: string) {
        confirmStringKey(key);
        return super.get(casefold(key));
    }
    has(key: string) {
        confirmStringKey(key);
        return super.has(casefold(key));
    }
    delete(key: string) {
        confirmStringKey(key);
        return super.delete(casefold(key));
    }
}