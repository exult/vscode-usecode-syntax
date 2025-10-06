# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6] - 2025-10-06

### Changed (0.1.6)

- Adding labelled `break`/`continue`
- Making `continue` highlight as a keyword
- Not highlighting `always` and `default` as labels

## [0.1.5] - 2025-10-01

### Changed (0.1.5)

- Auto-close comment blocks

## [0.1.4] - 2025-10-01

### Changed (0.1.4)

- Fixed missing highlight for `<` and `>` relational operators.

## [0.1.3] - 2025-09-29

### Changed (0.1.3)

- Split `goto` and `attend` into a dedicated "goto-type" group so they are highlighted separately from other control-flow keywords.
- Added label highlighting for label declarations and `goto`/`attend` label parameters (identifiers before `:` and after `goto`/`attend`).
- Improved operator handling for `object#`, `id#`, and `shape#` so `#` is consistently highlighted; added a ligature workaround so `#(` doesn't cause color flicker when fonts form ligatures.

### Notes (0.1.3)

- Adjusted grammar ordering and captures to avoid inconsistent tokenization caused by spacing-sensitive matches.

## [0.1.2] - 2025-09-29

### Fixed (0.1.2)

- Missing nobreak control flow keyword
- Fixing language configuration, which must be a single json array
- Improved highlighting of class/struct names in declarations

## [0.1.1] - 2025-09-29

### Fixed (0.1.1)

- Fixed GitHub Release attachment workflow so the generated `.vsix` is attached to releases (publish job now generates `release/vscode-usecode-syntax.vsix`).

## [0.1.0] - 2025-09-28

### Added

- Initial release: TextMate grammars for UseCode (.uc/.ucc/.uh/.ucxt) and UseCode assembly (.uca)
- Language configuration with brackets, auto-closing pairs, and surrounding pairs
- Sample file at `samples/test.uc` for testing and verification
- Comprehensive syntax highlighting for:
  - Keywords, types, operators, and control flow
  - Strings with escape sequences and rune escapes
  - Line and block comments
  - Preprocessor directives (#include, #game, #line, etc.)
  - Intrinsic function highlighting (UI_* functions)
  - Script commands and assembly mnemonics
  - Labels, numbers (hex and decimal), and identifiers

### Documentation & Packaging

- Added GPL-2.0-or-later LICENSE.md with proper markdown formatting
- Created marketplace-ready README.md with features, installation, and usage instructions
- Added CHANGELOG.md for tracking releases
- Added comprehensive .gitignore for build artifacts and temporary files
- Added .vscodeignore to exclude development files from packaged extension

### Package Metadata

- Updated package.json with marketplace-required fields:
  - License field set to "GPL-2.0-or-later"
  - Keywords for discoverability: "usecode", "exult", "ucc", "syntax", "language"
  - Icon placeholder reference
  - Repository, bugs, and homepage placeholder URLs (replace with actual repo)

### CI/CD

- Added GitHub Actions workflows:
  - `publish.yml` - Automated packaging and publishing on version tags
  - `test-package.yml` - Continuous integration testing of packaging on pushes/PRs
- Workflows support automatic publishing to VS Code Marketplace using VSCE_TOKEN secret
