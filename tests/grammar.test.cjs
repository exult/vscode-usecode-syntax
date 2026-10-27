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
            for (const prefix of ['', 'UI_']) {
                const spelling = prefix + name;
                scopeAt(tokenize(`${spelling}();`), 0, spelling, name === 'UNKNOWN' ? illegalIntrinsic : intrinsic);
            }
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

test('labels preserve punctuation and support consecutive and nested statements', () => {
    const lines = tokenize('{ first: second: goto first; } third: ;\nif (true) fourth: ;\nclass Derived : Base {}\nconverse:nested(0) {}\nalways: default:');
    for (const name of ['first', 'second', 'third']) scopeAt(lines, 0, name, 'entity.name.label.usecode');
    scopeAt(lines, 0, '{', 'punctuation.section.block.begin.bracket.curly.usecode');
    scopeAt(lines, 0, ';', 'keyword.operator.usecode');
    scopeAt(lines, 0, '}', 'punctuation.section.block.end.bracket.curly.usecode');
    scopeAt(lines, 1, 'fourth', 'entity.name.label.usecode');
    scopeAt(lines, 2, 'Derived', 'variable.other.usecode');
    scopeAt(lines, 3, 'converse', 'keyword.control.flow.usecode');
    scopeAt(lines, 3, 'nested', 'storage.type.declaration.usecode');
    scopeAt(lines, 4, 'always', 'keyword.control.flow.usecode');
    scopeAt(lines, 4, 'default', 'keyword.control.flow.usecode');
});

test('label references tolerate comments and line breaks', () => {
    for (const keyword of ['goto', 'attend', 'break', 'continue']) {
        const lines = tokenize(`${keyword} /* comment\ncontinued */\ntarget;\nvar following = 1;`);
        scopeAt(lines, 0, keyword, keyword === 'goto' || keyword === 'attend' ? 'keyword.other.goto-type.usecode' : 'keyword.control.flow.usecode');
        scopeAt(lines, 2, 'target', 'entity.name.label.usecode');
        scopeAt(lines, 3, 'following', 'variable.other.usecode');
    }
    const lines = tokenize('break; continue; var value = 1;');
    scopeAt(lines, 0, ';', 'keyword.operator.usecode');
    scopeAt(lines, 0, 'value', 'variable.other.usecode');
});

test('directives support whitespace, numeric line markers, and inline placement', () => {
    const lines = tokenize('# game "serpentbeta"\n# 42 "file.uc"\nvar x = 1; #\tline 23 "file.uc"\n# include "path/file.uh" // comment\n#strictbraces "true"\nvar after_directive = 1;');
    for (const [line, text] of [[0, '# game'], [1, '# '], [2, '#\tline'], [3, '# include'], [4, '#strictbraces']]) {
        scopeAt(lines, line, text, 'keyword.control.directive.usecode');
    }
    scopeAt(lines, 1, '42', 'constant.numeric.integer.usecode');
    scopeAt(lines, 2, '23', 'constant.numeric.integer.usecode');
    scopeAt(lines, 3, 'path/file.uh', 'string.quoted.double.usecode');
    scopeAt(lines, 3, '// comment', 'comment.line.double-slash.usecode');
    scopeAt(lines, 4, 'true', 'constant.language.boolean.usecode');
    scopeAt(lines, 5, 'after_directive', 'variable.other.usecode');
});

test('directive lines do not leak comments or string state into following source', () => {
    const lines = tokenize('#include "file.uh" /* ignored tail\nvar normal = 1;\n#unknown "unterminated\nvar following = 1;\n#game "unterminated\nvar final_value = 1;');
    for (const [line, name] of [[1, 'normal'], [3, 'following'], [5, 'final_value']]) scopeAt(lines, line, name, 'variable.other.usecode');
});

test('autonumber uses C-base numbers while source integers are decimal or hexadecimal', () => {
    for (const [literal, scope] of [['123', 'integer'], ['0Xc00', 'hex'], ['0xc00', 'hex'], ['01400', 'octal']]) {
        scopeAt(tokenize('# autonumber ' + literal), 0, literal, `constant.numeric.${scope}.usecode`);
    }
    scopeAt(tokenize('#autonumber 08'), 0, '08', 'invalid.illegal.numeric.usecode');
    scopeAt(tokenize('var x = 01400;'), 0, '01400', 'constant.numeric.integer.usecode');
});

test('hexadecimal literals accept either x case and malformed integers are single invalid tokens', () => {
    for (const literal of ['0XDEAD', '0xdead', '0X0', '0xFFFFFFFF']) scopeAt(tokenize(literal), 0, literal, 'constant.numeric.hex.usecode');
    for (const literal of ['0x12G', '0X', '0x', '123abc', '0b101', '0x12_G']) {
        const lines = tokenize(literal);
        scopeAt(lines, 0, literal, 'invalid.illegal.numeric.usecode');
        assert.equal(lines[0].tokens.length, 1);
        assert.equal(lines[0].tokens[0].endIndex, literal.length);
    }
    scopeAt(tokenize('foo0xAB'), 0, 'foo0xAB', 'variable.other.usecode');
    scopeAt(tokenize('"0x12G" // 0XDEAD'), 0, '0x12G', 'string.quoted.double.usecode');
});

test('script-only words are ordinary names outside scripts', () => {
    const lines = tokenize('var north = 1, frame = 2, fallthrough = 3;\nresurrect();\nscript item after 2 ticks {\n face north;\n repeat 2 { next frame; };\n say "text; }"; // }\n}\nvar south = 1;');
    for (const word of ['north', 'frame', 'fallthrough']) scopeAt(lines, 0, word, 'variable.other.usecode');
    scopeAt(lines, 1, 'resurrect', intrinsic);
    scopeAt(lines, 3, 'face', 'keyword.script.usecode');
    scopeAt(lines, 3, 'north', 'constant.language.value.usecode');
    scopeAt(lines, 4, 'next', 'keyword.script.usecode');
    scopeAt(lines, 4, 'frame', 'keyword.script.usecode');
    scopeAt(lines, 5, 'say', 'keyword.script.usecode');
    scopeAt(lines, 7, 'south', 'variable.other.usecode');
});

test('single-command, constructed, and appended scripts restore ordinary scopes', () => {
    const lines = tokenize('script item face north; var south = 1;\nvar commands = new script {\n face west;\n};\ncommands << /* comment\ncontinued */ { face east; } << { actor frame standing; };\nvar standing = 1;\nscript UI_get_npc_object(1) repeat 2 { face ne; }; var ne = 1;');
    for (const [line, word] of [[0, 'north'], [2, 'west'], [5, 'east'], [5, 'standing'], [7, 'ne']]) scopeAt(lines, line, word, 'constant.language.value.usecode');
    for (const [line, word] of [[0, 'south'], [6, 'standing']]) scopeAt(lines, line, word, 'variable.other.usecode');
    scopeAt(lines, 7, 'ne', 'variable.other.usecode', 1);
    scopeAt(lines, 7, 'UI_get_npc_object', intrinsic);
});

test('conversation mode follows nested blocks and is suspended by scripts and loops', () => {
    const lines = tokenize('var fallthrough = 1;\nconverse:nested(["bye"]) {\n case "bye":\n if (true) { fallthrough; }\n script item { raw(fallthrough); face north; }\n while (true) { var fallthrough = 1; }\n switch (event) { case 1: var fallthrough = 2; break; }\n for (entry in entries) { converse (0) { case "bye": fallthrough; } var fallthrough = 1; }\n fallthrough;\n}\nvar fallthrough = 1;\nconverse attend done; var fallthrough = 1;\ndone:');
    for (const [line, occurrence] of [[0, 0], [4, 0], [5, 0], [6, 0], [7, 1], [10, 0], [11, 0]]) {
        scopeAt(lines, line, 'fallthrough', 'variable.other.usecode', occurrence);
    }
    for (const line of [3, 7, 8]) scopeAt(lines, line, 'fallthrough', 'keyword.control.flow.usecode');
    scopeAt(lines, 4, 'north', 'constant.language.value.usecode');
    scopeAt(lines, 11, 'done', 'entity.name.label.usecode');
});

test('comments, strings, and nested scripts cannot end enclosing contexts', () => {
    const lines = tokenize('converse (0) {\n script item {\n  raw(new script { face north; });\n  say "/* } ; converse */";\n  // }\n  face south;\n }\n fallthrough;\n}\nvar frame = 1;');
    scopeAt(lines, 2, 'north', 'constant.language.value.usecode');
    scopeAt(lines, 3, 'converse', 'string.quoted.double.usecode');
    scopeAt(lines, 5, 'south', 'constant.language.value.usecode');
    scopeAt(lines, 7, 'fallthrough', 'keyword.control.flow.usecode');
    scopeAt(lines, 9, 'frame', 'variable.other.usecode');
});

test('complete source samples leave no context open', () => {
    const samples = [path.join(__dirname, '../samples/test.uc')];
    if (process.env.EXULT_ROOT) samples.push(path.join(process.env.EXULT_ROOT, 'tools/compiler/test1.uc'));
    for (const file of samples) {
        const lines = tokenize(fs.readFileSync(file, 'utf8'));
        assert.equal(lines.at(-1).stack.depth, 1, `Unclosed context in ${file}: ${lines.at(-1).stack}`);
    }
});
