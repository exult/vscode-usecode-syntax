# Changelog

All notable changes to this project will be documented in this file.

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
