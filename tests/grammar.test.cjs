const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const { Registry, INITIAL } = require('vscode-textmate');
const { loadWASM, OnigScanner, OnigString } = require('vscode-oniguruma');

let grammar;
before(async () => {
    await loadWASM(fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')));
    const registry = new Registry({
        onigLib: Promise.resolve({
            createOnigScanner: patterns => new OnigScanner(patterns),
            createOnigString: text => new OnigString(text)
        }),
        loadGrammar: async () => JSON.parse(fs.readFileSync(path.join(__dirname, '../syntaxes/usecode.tmLanguage.json'), 'utf8'))
    });
    grammar = await registry.loadGrammar('source.usecode');
});

function tokenize(source) {
    let stack = INITIAL;
    return source.split('\n').map(line => {
        const result = grammar.tokenizeLine(line, stack);
        stack = result.ruleStack;
        return { line, tokens: result.tokens, stack };
    });
}

function scopeAt(lines, line, text, expected, occurrence = 0) {
    let offset = -1;
    for (let i = 0; i <= occurrence; ++i) offset = lines[line].line.indexOf(text, offset + 1);
    assert.notEqual(offset, -1, `Missing ${JSON.stringify(text)} on line ${line + 1}`);
    const token = lines[line].tokens.find(t => t.startIndex <= offset && offset < t.endIndex);
    assert.ok(token.scopes.includes(expected), `${JSON.stringify(text)} on line ${line + 1}: expected ${expected}, got ${token.scopes}`);
}

const intrinsic = 'entity.name.function.intrinsic.usecode';
const illegalIntrinsic = 'invalid.illegal.intrinsic.usecode';

test('intrinsic names survive comments and newlines before the call', () => {
    const lines = tokenize('UI_get_random /* comment */ (2);\nget_random // comment\n(2);\nUI_get_random\n/* multiline\ncomment */\n(2);');
    scopeAt(lines, 0, 'UI_get_random', intrinsic);
    scopeAt(lines, 1, 'get_random', intrinsic);
    scopeAt(lines, 3, 'UI_get_random', intrinsic);
    scopeAt(lines, 4, '/*', 'comment.block.usecode');
});

test('intrinsic table corrections and reserved names', () => {
    for (const name of ['sib_path_run_usecode', 'sib_is_dest_reachable']) {
        for (const prefix of ['', 'UI_']) scopeAt(tokenize(`${prefix}${name}();`), 0, prefix + name, intrinsic);
    }
    for (const name of ['UNKNOWN', 'UI_UNKNOWN', 'UI_init_reset_conv_face', 'UI_custom', 'UI_123', 'UI_']) {
        scopeAt(tokenize(`${name}();`), 0, name, illegalIntrinsic);
    }
    scopeAt(tokenize('init_reset_conv_face();'), 0, 'init_reset_conv_face', 'entity.name.function.usecode');
});

test('numeric intrinsic names allow hexadecimal values through 65535 with leading zeroes', () => {
    for (const suffix of ['0', '1', '001', 'aB', 'FFFF', '000000ffff', '000000']) {
        const name = 'UI_UNKNOWN_' + suffix;
        scopeAt(tokenize(`${name}\n();`), 0, name, intrinsic);
    }
    for (const suffix of ['', '10000', '00010000', 'FFFFF', '1G', '-1']) {
        const name = 'UI_UNKNOWN_' + suffix;
        scopeAt(tokenize(`${name}();`), 0, name, illegalIntrinsic);
    }
});

test('all engine table names are covered', { skip: !process.env.EXULT_ROOT }, () => {
    for (const game of ['bg', 'si', 'sibeta']) {
        const table = fs.readFileSync(path.join(process.env.EXULT_ROOT, 'usecode', `${game}intrinsics.h`), 'utf8');
        for (const name of new Set([...table.matchAll(/USECODE_INTRINSIC_PTR\((\w+)\)/g)].map(m => m[1]))) {
            const spelling = 'UI_' + name;
            scopeAt(tokenize(`${spelling}();`), 0, spelling, name === 'UNKNOWN' ? illegalIntrinsic : intrinsic);
        }
    }
});

test('compiler keywords do not depend on following whitespace', () => {
    for (const word of ['with', 'to', 'minutes', 'hours']) {
        scopeAt(tokenize(`${word}/* comment */`), 0, word, 'keyword.other.usecode');
    }
    for (const word of ['new', 'delete']) scopeAt(tokenize(`${word}(value)`), 0, word, 'keyword.operator.usecode');
    for (const word of ['class', 'struct', 'enum', 'nested']) {
        scopeAt(tokenize(`${word}/* comment */`), 0, word, 'storage.type.declaration.usecode');
    }
    for (const source of ['run_script([]);', 'run_script\n([]);', 'say/* comment */("text");', 'say\n("text");']) {
        scopeAt(tokenize(source), 0, source.startsWith('say') ? 'say' : 'run_script', 'keyword.function-like.usecode');
    }
    scopeAt(tokenize('enum();'), 0, 'enum', 'storage.type.declaration.usecode');
    scopeAt(tokenize('runscript();'), 0, 'runscript', 'entity.name.function.usecode');
});

test('only the contiguous .original suffix is special', () => {
    const lines = tokenize('foo.original();\nfoo.original\n();\noriginal();\nfoo. original();\nfoo.originally();');
    scopeAt(lines, 0, '.', 'keyword.operator.usecode');
    scopeAt(lines, 0, 'original', 'keyword.function-like.usecode');
    scopeAt(lines, 1, 'original', 'keyword.function-like.usecode');
    scopeAt(lines, 3, 'original', 'entity.name.function.usecode');
    scopeAt(lines, 4, 'original', 'entity.name.function.usecode');
    scopeAt(lines, 5, 'originally', 'entity.name.function.usecode');
});
