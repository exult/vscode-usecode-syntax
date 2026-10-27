const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { formatText } = require('../out/formatter');

function activate(source, eol = 1, width = 100) {
    const calls = { logs: [], registrations: [], configurations: [], reads: 0 };
    const subscriptions = [];
    const output = { appendLine: line => calls.logs.push(line), dispose() {} };
    const registration = { dispose() {} };
    const api = {
        window: { createOutputChannel(name) { assert.equal(name, 'Usecode Formatter'); return output; } },
        workspace: { getConfiguration(section, uri) {
            calls.configurations.push({ section, uri });
            return { get(key, fallback) { assert.equal(key, 'maxLineLength'); assert.equal(fallback, 100); return width; } };
        } },
        languages: { registerDocumentFormattingEditProvider(selector, provider) {
            calls.registrations.push({ selector, provider });
            return registration;
        } },
        EndOfLine: { LF: 1, CRLF: 2 },
        Range: class { constructor(start, end) { this.start = start; this.end = end; } },
        TextEdit: { replace: (range, newText) => ({ range, newText }) }
    };
    const exports = {};
    const code = fs.readFileSync(path.join(__dirname, '../out/extension.js'), 'utf8');
    vm.runInNewContext(code, { exports, Error, require(name) {
        if (name === 'vscode') return api;
        assert.equal(name, './formatter');
        return require('../out/formatter');
    } }, { filename: 'extension.js' });
    exports.activate({ subscriptions });
    const uri = { toString: () => 'untitled:example.uc' };
    const document = {
        uri, eol,
        getText() { calls.reads++; return source; },
        positionAt(offset) {
            const prefix = source.slice(0, offset);
            return { offset, line: (prefix.match(/\n/g) || []).length, character: offset - prefix.lastIndexOf('\n') - 1 };
        }
    };
    return { calls, subscriptions, output, registration, document, provider: calls.registrations[0].provider };
}

test('extension registers a disposable Usecode document formatter', () => {
    const fixture = activate('');
    assert.equal(fixture.calls.registrations.length, 1);
    assert.equal(fixture.calls.registrations[0].selector.language, 'usecode');
    assert.deepEqual(fixture.subscriptions, [fixture.output, fixture.registration]);
});

test('provider uses document settings, editor indentation, CRLF, and UTF-16 positions', () => {
    const source = 'void f(){say("😀");longCall(argument_one,argument_two,argument_three,argument_four);}';
    const fixture = activate(source, 2, 40);
    const edits = fixture.provider.provideDocumentFormattingEdits(fixture.document, { tabSize: 2, insertSpaces: true }, { isCancellationRequested: false });
    let result = source;
    for (const edit of [...edits].reverse()) result = result.slice(0, edit.range.start.offset) + edit.newText + result.slice(edit.range.end.offset);
    assert.equal(result, formatText(source, { width: 40, tabSize: 2, insertSpaces: true, eol: '\r\n' }));
    assert.ok(result.includes('\r\n  say("😀");'));
    assert.equal(fixture.calls.configurations[0].section, 'usecode.format');
    assert.equal(fixture.calls.configurations[0].uri, fixture.document.uri);
    assert.equal(fixture.calls.logs.length, 0);
});

test('provider returns no edits for formatted or malformed documents', () => {
    for (const source of [formatText('void f(){}'), 'void f(){', '/* unterminated']) {
        const fixture = activate(source);
        const edits = fixture.provider.provideDocumentFormattingEdits(fixture.document, { tabSize: 4, insertSpaces: false }, { isCancellationRequested: false });
        assert.equal(edits.length, 0);
        if (source === 'void f(){' || source.startsWith('/*')) {
            assert.equal(fixture.calls.logs.length, 1);
            assert.ok(fixture.calls.logs[0].startsWith('untitled:example.uc: '));
        } else assert.equal(fixture.calls.logs.length, 0);
    }
});

test('provider honors cancellation before reading and after formatting', () => {
    const fixture = activate('void f(){}');
    const token = { isCancellationRequested: true };
    assert.equal(fixture.provider.provideDocumentFormattingEdits(fixture.document, { tabSize: 4, insertSpaces: false }, token).length, 0);
    assert.equal(fixture.calls.reads, 0);
    token.isCancellationRequested = false;
    fixture.document.getText = () => { token.isCancellationRequested = true; return 'void f(){}'; };
    assert.equal(fixture.provider.provideDocumentFormattingEdits(fixture.document, { tabSize: 4, insertSpaces: false }, token).length, 0);
});

test('extension manifest supplies activation, settings, and a packaging build', () => {
    const manifest = require('../package.json');
    assert.equal(manifest.main, './out/extension.js');
    assert.ok(fs.existsSync(path.join(__dirname, '..', manifest.main)));
    assert.ok(manifest.activationEvents.includes('onLanguage:usecode'));
    assert.equal(manifest.contributes.configuration.properties['usecode.format.maxLineLength'].minimum, 40);
    assert.equal(manifest.scripts['vscode:prepublish'], 'npm run compile');
});
