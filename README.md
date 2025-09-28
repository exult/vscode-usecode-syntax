# Usecode C (UCC) Syntax Highlighting for VSCode

This lightweight extension provides TextMate-based syntax highlighting for Exult's UseCode C (\*.ucc, \*.uc, and \*.uh), UseCode eXTracted (\*.ucxt), and UseCode Assembly (\*.uca) files.

Initial version was vibe-coded with `Copilot/GPT-5 mini`.

Install locally for testing:

1. Open the `vscode-usecode-syntax` folder in VSCode.
2. Run "Extension: Install from VSIX..." after packaging or use the "Run Extension" debugger to test the grammar in the Extension Development Host.

Notes:

- The grammar attempts to highlight keywords, script commands, types, numbers, strings, comments, directives, function names, and other identifiers.

- Script commands are lexed by the original project in a separate scanner state; the grammar approximates common command forms.
