// Ported from format_usecode.py. Keep source tokens intact and edit only their gaps.
type TokenKind = 'directive' | 'string' | 'comment' | 'identity' | 'original' | 'word' | 'operator' | 'punct';

interface Token {
    readonly kind: TokenKind;
    readonly text: string;
    readonly start: number;
    readonly end: number;
}

export interface FormatOptions {
    readonly width?: number;
    readonly tabSize?: number;
    readonly insertSpaces?: boolean;
    readonly eol?: '\n' | '\r\n';
}

export interface WhitespaceEdit {
    readonly start: number;
    readonly end: number;
    readonly newText: string;
}

interface Settings {
    readonly width: number;
    readonly tabSize: number;
    readonly indent: string;
    readonly eol: '\n' | '\r\n';
}

const lexer = /(?<directive>\#[^\r\n]*)|(?<string>"(?:\\[\s\S]|[^"\\])*"\*?)|(?<comment>\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)|(?<identity>\b(?:shape|object|id)\#)|(?<original>\.original)|(?<word>\$?[A-Za-z_][A-Za-z_0-9]*|0[xX][0-9a-fA-F]+(?![A-Za-z_0-9])|[0-9]+(?![A-Za-z_0-9]))|(?<operator>&&|\|\||==|!=|<=|>=|->|::|<<|\+=|-=|\*=|\/=|%=|&=)|(?<punct>[^ \t\r\n])/g;
const control = new Set(['if', 'while', 'for', 'switch', 'converse', 'catch', 'repeat', 'nested']);
const operators = new Set(['=', '+', '-', '*', '/', '%', '&', '|', '^', '<', '>', '&&', '||', '==', '!=', '<=', '>=', '<<', '+=', '-=', '*=', '/=', '%=', '&=']);
const prefixContext = new Set([...operators, '(', '[', ',', ':', ';', '{', 'return', 'throw', 'case', 'wait', 'frame', 'face', 'step', 'music', 'sfx', 'speech', 'call', 'after']);

function settings(options: FormatOptions): Settings {
    const width = options.width ?? 100;
    const tabSize = options.tabSize ?? 4;
    if (!Number.isInteger(width) || width < 40) throw new Error('line width must be an integer of at least 40');
    if (!Number.isInteger(tabSize) || tabSize < 1) throw new Error('tab size must be a positive integer');
    return { width, tabSize, indent: options.insertSpaces ? ' '.repeat(tabSize) : '\t', eol: options.eol ?? '\n' };
}

function lex(text: string): Token[] {
    const result: Token[] = [];
    for (const match of text.matchAll(lexer)) {
        const value = match[0];
        const start = match.index!;
        if (value === '"' || value === '/' && text.startsWith('/*', start)) {
            throw new Error(`unterminated literal or comment at offset ${start}`);
        }
        if (/^[0-9]$/.test(value) && match.groups!.punct !== undefined) {
            throw new Error(`invalid integer literal at offset ${start}`);
        }
        const kind = Object.keys(match.groups!).find(key => match.groups![key] !== undefined) as TokenKind;
        result.push({ kind, text: value, start, end: start + value.length });
    }
    return result;
}

function sameTokens(left: readonly Token[], right: readonly Token[]): boolean {
    return left.length === right.length && left.every((token, i) => token.kind === right[i].kind && token.text === right[i].text);
}

function spacing(tokens: readonly string[]): { before: Set<number>; after: Set<number> } {
    const before = new Set<number>();
    const after = new Set<number>();
    const stack: number[] = [];
    for (let i = 0; i < tokens.length; ++i) {
        const current = tokens[i];
        const previous = tokens[i - 1] ?? '';
        if (current === '<' && (previous === 'struct' || previous === 'class')) {
            before.add(i);
            after.add(i);
            let j = i + 1;
            while (j < tokens.length && !['>', ';', '{'].includes(tokens[j])) ++j;
            if (tokens[j] === '>') before.add(j);
        }
        if (['!', '-', '+', '*', '&'].includes(current) && (!previous || prefixContext.has(previous))) after.add(i);
        if (current === '*' && tokens.slice(Math.max(0, i - 8), i).includes('repeat') && tokens[i + 2] === ';') after.add(i);
        if (current === '(') stack.push(i);
        else if (current === ')') {
            const opening = stack.pop();
            if (opening === undefined) throw new Error('unmatched closing parenthesis');
            const inside = tokens.slice(opening + 1, i);
            if (inside.length === 1 && ['byte', 'int', 'long', 'var'].includes(inside[0]) || ['struct', 'class'].includes(inside[0]) && inside[1] === '<') after.add(i);
        }
    }
    if (stack.length) throw new Error('unclosed parenthesis');
    return { before, after };
}

function needsSpace(tokens: readonly string[], i: number, before: ReadonlySet<number>, after: ReadonlySet<number>): boolean {
    if (!i) return false;
    const previous = tokens[i - 1];
    const current = tokens[i];
    if (operators.has(previous + current) || previous + current === '//' || previous + current === '/*') return true;
    // Removing this gap would create the compiler's atomic .original token.
    if (previous === '.' && current.startsWith('original')) return true;
    if (before.has(i) || after.has(i - 1)) return false;
    if ([')', ']', ',', ';', '.', '.original', '->', '::', '@', ':'].includes(current)) return false;
    if (['(', '[', '.', '->', '::', '@'].includes(previous)) return false;
    if (current === '(') {
        return control.has(previous) || [')', ']'].includes(previous) || previous.startsWith('"') ||
            /^[0-9]/.test(previous) && tokens[i - 2] !== '@' || operators.has(previous);
    }
    if (current === '[') return operators.has(previous) || ['return', 'case'].includes(previous);
    return true;
}

function visualWidth(text: string, tabSize: number): number {
    let column = 0;
    for (const char of text) column = char === '\t' ? column + tabSize - column % tabSize : column + 1;
    return column;
}

function wrap(line: string, indent: number, config: Settings): string[] {
    let prefix = config.indent.repeat(indent);
    if (/[\r\n]/.test(line) || line.includes('//') || line.includes('/*') || /\b(?:shape|object|id)#/.test(line)) return [prefix + line];
    const tokens = lex(line);
    const openings: number[] = [];
    const ends = new Map<number, number>();
    for (let i = 0; i < tokens.length; ++i) {
        if (tokens[i].text === '(') openings.push(i);
        else if (tokens[i].text === ')' && openings.length) ends.set(openings.pop()!, i);
    }
    const breaks: number[] = [];
    for (let i = 0; i < tokens.length; ++i) {
        const token = tokens[i];
        const end = ends.get(i);
        const largeGroup = token.text === '(' && (end === undefined ? line.length : tokens[end].end) - token.start > 40;
        if ((token.text === ',' || largeGroup) && i + 1 < tokens.length && tokens[i + 1].text !== ')') breaks.push(tokens[i + 1].start);
        else if (['&&', '||'].includes(token.text) || i > 0 && token.kind === 'string' && tokens[i - 1].kind === 'string') breaks.push(token.start);
    }
    const parts: string[] = [];
    let start = 0;
    let continuation = false;
    while (visualWidth(prefix + line.slice(start), config.tabSize) > config.width) {
        const choices = breaks.filter(position => position > start);
        if (!choices.length) break;
        const fitting = choices.filter(position => visualWidth(prefix + line.slice(start, position).trimEnd(), config.tabSize) <= config.width);
        const stop = fitting.length ? fitting[fitting.length - 1] : choices[0];
        parts.push(prefix + line.slice(start, stop).trimEnd());
        start = stop;
        if (!continuation) {
            prefix += config.indent;
            continuation = true;
        }
    }
    parts.push(prefix + line.slice(start));
    return parts;
}

/** Format complete Usecode source while preserving all lexical tokens. */
export function formatText(text: string, options: FormatOptions = {}): string {
    const config = settings(options);
    const matches = lex(text);
    if (!matches.length) return text ? config.eol : '';
    const tokens = matches.map(token => token.text);
    const { before, after } = spacing(tokens);
    const out: string[] = [];
    let line = '';
    const delimiters: string[] = [];
    const braces: string[] = [];
    let lineIndent = 0;
    let rootGap = false;

    const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
    const flush = () => {
        if (!line) return;
        out.push(...wrap(line, lineIndent, config));
        line = '';
        if (rootGap) { blank(); rootGap = false; }
    };
    const append = (token: string, i: number, indent = braces.length) => {
        if (!line) lineIndent = indent;
        else if (needsSpace(tokens, i, before, after)) line += ' ';
        line += token;
    };
    const atStatementLevel = () => !delimiters.length || delimiters[delimiters.length - 1] === '{';

    for (let i = 0; i < matches.length; ++i) {
        const match = matches[i];
        const token = tokens[i];
        const next = tokens[i + 1] ?? '';
        const sameLineComment = matches[i + 1]?.kind === 'comment' && !/[\r\n]/.test(text.slice(match.end, matches[i + 1].start));
        if (match.kind === 'directive') { flush(); out.push(token); continue; }
        if (match.kind === 'comment') {
            const gap = i ? text.slice(matches[i - 1].end, match.start) : '';
            const trailing = i > 0 && !/[\r\n]/.test(gap);
            if (trailing && line) line += '  ' + token;
            else {
                flush();
                const paragraph = i > 0 && (gap.match(/\n/g)?.length ?? 0) > 1;
                if (paragraph || !braces.length && out.length && !out[out.length - 1].trimStart().startsWith('//')) blank();
                lineIndent = braces.length;
                line = token;
            }
            if (token.startsWith('//') || /[\r\n]/.test(token) || !trailing) flush();
            continue;
        }
        if (['case', 'default', 'always'].includes(token) && atStatementLevel()) {
            flush(); append(token, i, Math.max(0, braces.length - 1)); continue;
        }
        if (token === '{') {
            let kind = 'block';
            if (line.startsWith('enum ')) kind = 'enum';
            else if (line.startsWith('converse')) kind = 'converse';
            else if (line.startsWith('switch')) kind = 'switch';
            const last = out[out.length - 1];
            if (!braces.length && last && !last.endsWith('*/') && !last.trimStart().startsWith('//')) blank();
            append(token, i); flush(); braces.push(kind); delimiters.push(token); continue;
        }
        if (token === '}') {
            flush();
            if (delimiters.pop() !== '{' || !braces.length) throw new Error('unmatched closing brace');
            braces.pop(); append(token, i);
            if (!braces.length) rootGap = true;
            if (![';', ')', ']', ',', 'else', 'nobreak', 'while', '&'].includes(next) && !sameLineComment) flush();
            continue;
        }
        if (token === '(' || token === '[') delimiters.push(token);
        else if (token === ')' || token === ']') {
            if (delimiters.pop() !== (token === ')' ? '(' : '[')) throw new Error('unbalanced delimiter');
        }
        if (next === ':' && !line && atStatementLevel()) {
            append(token, i, Math.max(0, braces.length - 1)); continue;
        }
        append(token, i);
        if (token === ':' && atStatementLevel()) flush();
        else if (token === ';' && next !== ';' && atStatementLevel() && !sameLineComment) flush();
        else if (token === ',' && delimiters[delimiters.length - 1] === '{' && braces[braces.length - 1] === 'enum' && !sameLineComment) flush();
    }
    if (delimiters.length || braces.length) throw new Error('unclosed delimiter');
    flush();
    while (out[out.length - 1] === '') out.pop();
    const result = out.join(config.eol) + config.eol;
    if (!sameTokens(matches, lex(result))) throw new Error('formatter changed lexical tokens');
    return result;
}

/** UTF-16 offsets match TextDocument.positionAt; token contents are never edited. */
export function formatEdits(text: string, options: FormatOptions = {}): WhitespaceEdit[] {
    const result = formatText(text, options);
    const oldTokens = lex(text);
    const newTokens = lex(result);
    const edits: WhitespaceEdit[] = [];
    let oldStart = 0;
    let newStart = 0;
    for (let i = 0; i < oldTokens.length; ++i) {
        const left = oldTokens[i];
        const right = newTokens[i];
        const newText = result.slice(newStart, right.start);
        if (text.slice(oldStart, left.start) !== newText) edits.push({ start: oldStart, end: left.start, newText });
        oldStart = left.end;
        newStart = right.end;
    }
    if (text.slice(oldStart) !== result.slice(newStart)) edits.push({ start: oldStart, end: text.length, newText: result.slice(newStart) });
    return edits;
}
