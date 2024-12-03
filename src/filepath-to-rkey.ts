/*
restricted to a subset of ASCII characters — the allowed characters are:
    alphanumeric (A-Za-z0-9), period, dash, underscore, colon, or tilde (.-_:~)
must have at least 1 and at most 512 characters
the specific record key values . and .. are not allowed
must be a permissible part of repository MST path string (the above constraints satisfy this condition)
must be permissible to include in a path component of a URI (following RFC-3986, section 3.3).
    The above constraints satisfy this condition, by matching the "unreserved" characters allowed in generic URI paths.
*/

export function filepathToRkey(vaultName: string, filepath: string) {
    if (filepath === '') throw new Error('File path is empty!');

    filepath = 
        vaultName.replace(/[^A-Za-z0-9.\-_:~]+/g, '-').replace(/_+/g, '-') +
        filepath
            // regex excludes : and ~ because we use those as control characters
            .replace(/[^A-Za-z0-9.\-_]/g, $$ => {
                if ($$ == '\\' || $$ == '/') {
                    return ':';
                } else {
                    return '~' + $$.charCodeAt(0).toString(16).padStart(4, '0');
                }
            });

    if (filepath.length > 512) throw new Error('File path too long!');

    return filepath;
}

export function filepathFromRkey(rkey: string) {
    return rkey
        .replace(/:/g, '/')
        .replace(/~([0-9a-fA-F]{4})/g, ($$, $1) => String.fromCharCode(parseInt($1, 16)));
}