const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { formatText, formatEdits } = require('../out/formatter');

function applyEdits(text, edits) {
    for (const edit of [...edits].reverse()) {
        assert.match(text.slice(edit.start, edit.end), /^[ \t\r\n]*$/, 'only whitespace may be removed');
        assert.match(edit.newText, /^[ \t\r\n]*$/, 'only whitespace may be inserted');
        text = text.slice(0, edit.start) + edit.newText + text.slice(edit.end);
    }
    return text;
}

function check(text, options) {
    const result = formatText(text, options);
    assert.equal(formatText(result, options), result, 'formatting must be idempotent');
    assert.equal(applyEdits(text, formatEdits(text, options)), result, 'gap edits must reproduce formatting');
    assert.deepEqual(formatEdits(result, options), [], 'formatted text needs no edits');
    return result;
}

test('formatter matches reference brace, operator, and blank-line layout', () => {
    assert.equal(check('void x 0x800 (){if(a!=b){x=-5;}else{x=a- -b;}}'), [
        'void x 0x800 () {',
        '\tif (a != b) {',
        '\t\tx = -5;',
        '\t} else {',
        '\t\tx = a - -b;',
        '\t}',
        '}',
        ''
    ].join('\n'));
    assert.equal(check('void a(){}void b(){}'), 'void a() {\n}\n\nvoid b() {\n}\n');
});

test('conversation cases and portrait slots follow the reference layout', () => {
    const result = check('void x 0x800 (){converse(0){case "a"(remove):A.say@0("b");default:hide@1();}}');
    assert.ok(result.includes('converse (0) {\n\tcase "a" (remove):\n\t\tA.say@0("b");'));
    assert.ok(result.includes('\tdefault:\n\t\thide@1();'));
});

test('scripts retain casts, dereferenced repeats, and double terminators', () => {
    const result = check('void x 0x800 (){var s=script item repeat 2 *commands;;script item{raw((byte)REPEAT);raw(-5);raw(2);}}');
    assert.ok(result.includes('script item repeat 2 *commands;;'));
    assert.ok(result.includes('raw((byte)REPEAT);\n\t\traw(-5);'));
    const long = check('void x 0x800 (){var check = resolveCompanionBark(1, "whoa!", "damn!")->run_script((new script raw((byte)89);) & AVATAR->find_direction(item));}');
    assert.ok(long.includes('raw((byte)89);'));
});

test('string prefixes, rune escapes, and multiline strings stay atomic', () => {
    const result = check('void x(){converse(0){case "hello"*:say("text" * 3);say("\\{th} \\"quoted\\" \\{dot}");say("line one\nline two");say("escaped\\\nnewline");}}');
    assert.ok(result.includes('case "hello"*:'));
    assert.ok(result.includes('say("text" * 3);'));
    for (const literal of ['"\\{th} \\"quoted\\" \\{dot}"', '"line one\nline two"', '"escaped\\\nnewline"']) assert.ok(result.includes(literal));
});

test('spacing cannot create operators, comments, or .original tokens', () => {
    const result = check('void x(){x=a & &b;y=a - > b;z=a / /b;p=& &b;q=a < < b;item. original();item.original();}');
    for (const text of ['a & &b', 'a - > b', 'a / / b', '& &b', 'a < < b', 'item. original()', 'item.original()']) assert.ok(result.includes(text), text);
});

test('generic types, struct member addresses, enum entries, and labels', () => {
    const result = check('enum P{X=&struct<Position>::x,Y=2,};void f(){start:var p=[1,2];goto start;}');
    assert.ok(result.includes('X = &struct<Position>::x,\n\tY = 2,'));
    assert.ok(result.includes('\nstart:\n\tvar p = [1, 2];'));
});

test('directives retain their exact text and consume the rest of their source line', () => {
    const result = check('  #game "serpentisle"\nvoid f(){var x=1; # game "serpentbeta" // tail\nvar y=2;}');
    assert.ok(result.startsWith('#game "serpentisle"\n'));
    assert.ok(result.includes('\n# game "serpentbeta" // tail\n'));
    assert.ok(result.includes('\tvar y = 2;'));
});

test('comments preserve all content and paragraph boundaries', () => {
    const comment = '/* Header\n * paragraph\n */';
    const result = check(comment + '\nvoid x(){x=1;// tail  \n// body\ny=2;}');
    assert.ok(result.startsWith(comment));
    assert.ok(result.includes('x = 1;  // tail  \n'));
    assert.ok(check('// one\n\n// two\nstruct P{var x;}').startsWith('// one\n\n// two\n'));
});

test('long calls wrap deterministically without splitting literals or function identities', () => {
    const literal = '"' + 'x'.repeat(200) + '"';
    const result = check('void x(){f(' + Array.from({ length: 30 }, (_, i) => 'argument' + i).join(',') + ');say(' + literal + ');}');
    assert.ok(result.includes(',\n\t\targument'));
    assert.ok(result.includes(literal));
    const name = 'longFunctionName'.repeat(10);
    const header = check(`void ${name} object#(FIRST_NPC_FUNCTION-SOMEBODY) (){}`).split('\n')[0];
    assert.ok(header.includes('object#(FIRST_NPC_FUNCTION - SOMEBODY) () {'));
    const narrow = check('void f(){call(' + Array(15).fill('argument').join(',') + ');}', { width: 40 });
    assert.ok(narrow.split('\n').length > 5);
});

test('editor indentation and line-ending options are respected', () => {
    assert.equal(check('void f(){if(true){return;}}', { insertSpaces: true, tabSize: 2, eol: '\r\n' }), 'void f() {\r\n  if (true) {\r\n    return;\r\n  }\r\n}\r\n');
    const comment = '/* line one\r\n * line two\r\n */';
    const literal = '"line one\r\nline two"';
    const result = check(`void f(){${comment}say(${literal});}`, { eol: '\r\n' });
    assert.ok(result.includes(comment));
    assert.ok(result.includes(literal));
});

test('offsets are UTF-16 and unicode string contents are untouched', () => {
    const source = 'void f(){say("😀 Café");var x=1;}';
    const result = check(source);
    assert.ok(result.includes('"😀 Café"'));
    const edit = formatEdits(source).find(e => e.start > source.indexOf('😀'));
    assert.ok(edit);
    assert.match(source.slice(edit.start, edit.end), /^[ \t\r\n]*$/);
});

test('empty documents and whitespace-only documents', () => {
    assert.equal(check(''), '');
    assert.equal(check(' \t\r\n'), '\n');
    assert.equal(check(' \t', { eol: '\r\n' }), '\r\n');
});

test('malformed input is rejected before any edits can be returned', () => {
    for (const source of ['void x () {', 'say("unterminated);', '/* unterminated', 'void f(){a[1);}', '}', 'f())', 'var x=0x12G;']) {
        assert.throws(() => formatText(source), undefined, source);
        assert.throws(() => formatEdits(source), undefined, source);
    }
    for (const options of [{ width: 0 }, { width: 39 }, { width: NaN }, { width: 40.5 }, { tabSize: 0 }, { tabSize: Infinity }]) assert.throws(() => formatText('', options));
});

test('extension sample formats safely and idempotently', () => {
    check(fs.readFileSync(path.join(__dirname, '../samples/test.uc'), 'utf8'));
});
