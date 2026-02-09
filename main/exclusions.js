'use strict';

// Directories that should never be suggested for deletion
const EXCLUDED_DIR_NAMES = new Set([
    'node_modules', '.git', '.svn', '.hg',
    '.venv', 'venv', '__pycache__', '.tox',
    '.vs', '.vscode', '.idea', '.eclipse',
    'bower_components', '.gradle', '.m2',
    '.cargo', 'target',
]);

// Path prefixes for system files (case-insensitive)
const SYSTEM_PATH_PREFIXES = [
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\ProgramData',
    'C:\\$Recycle.Bin',
    'C:\\System Volume Information',
    'C:\\Recovery',
    'C:\\Boot',
];

function isExcludedDir(dirName) {
    return EXCLUDED_DIR_NAMES.has(dirName);
}

function isSystemPath(filePath) {
    const upper = filePath.toUpperCase();
    return SYSTEM_PATH_PREFIXES.some(prefix => upper.startsWith(prefix.toUpperCase()));
}

function isInsideExcludedDir(filePath) {
    const parts = filePath.split(/[/\\]/);
    return parts.some(part => EXCLUDED_DIR_NAMES.has(part));
}

module.exports = { EXCLUDED_DIR_NAMES, SYSTEM_PATH_PREFIXES, isExcludedDir, isSystemPath, isInsideExcludedDir };
