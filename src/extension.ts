import * as vscode from 'vscode';
import { formatEdits } from './formatter';

export function activate(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel('Usecode Formatter');
    const provider: vscode.DocumentFormattingEditProvider = {
        provideDocumentFormattingEdits(document, options, cancellation) {
            if (cancellation.isCancellationRequested) return [];
            try {
                const edits = formatEdits(document.getText(), {
                    width: vscode.workspace.getConfiguration('usecode.format', document.uri).get<number>('maxLineLength', 100),
                    tabSize: options.tabSize,
                    insertSpaces: options.insertSpaces,
                    eol: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
                });
                if (cancellation.isCancellationRequested) return [];
                return edits.map(edit => vscode.TextEdit.replace(new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)), edit.newText));
            } catch (error) {
                output.appendLine(`${document.uri.toString()}: ${error instanceof Error ? error.message : String(error)}`);
                return [];
            }
        }
    };
    context.subscriptions.push(output, vscode.languages.registerDocumentFormattingEditProvider({ language: 'usecode' }, provider));
}
