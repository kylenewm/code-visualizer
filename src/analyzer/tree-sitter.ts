/**
 * Tree-sitter parser wrapper for TypeScript/JavaScript/Python
 * Phase A: Fast syntax-only parsing (<100ms per file)
 */

import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';

export type SupportedLanguage = 'typescript' | 'javascript' | 'tsx' | 'jsx' | 'python';

const languageMap: Record<SupportedLanguage, unknown> = {
  typescript: TypeScript.typescript,
  tsx: TypeScript.tsx,
  javascript: TypeScript.typescript,  // TS parser handles JS fine
  jsx: TypeScript.tsx,                 // TSX parser handles JSX
  python: Python,
};

/**
 * Infer language from file extension
 */
export function inferLanguage(filePath: string): SupportedLanguage | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': return 'typescript';
    case 'tsx': return 'tsx';
    case 'js':
    case 'mjs':
    case 'cjs': return 'javascript';
    case 'jsx': return 'jsx';
    case 'py': return 'python';
    default: return null;
  }
}

/**
 * Check if a language is Python
 */
export function isPython(language: SupportedLanguage): boolean {
  return language === 'python';
}

/**
 * Check if a language is TypeScript/JavaScript family
 */
export function isTypeScript(language: SupportedLanguage): boolean {
  return ['typescript', 'javascript', 'tsx', 'jsx'].includes(language);
}

/**
 * Parser pool to avoid creating new parsers for each file
 */
const parserCache = new Map<SupportedLanguage, Parser>();

function getParser(language: SupportedLanguage): Parser {
  let parser = parserCache.get(language);
  if (!parser) {
    parser = new Parser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.setLanguage(languageMap[language] as any);
    parserCache.set(language, parser);
  }
  return parser;
}

export interface ParseResult {
  tree: Parser.Tree;
  language: SupportedLanguage;
  filePath: string;
  parseTimeMs: number;
}

/**
 * Parse a source file and return the syntax tree
 */
export function parseSource(
  source: string,
  filePath: string,
  language?: SupportedLanguage
): ParseResult {
  const lang = language ?? inferLanguage(filePath);
  if (!lang) {
    throw new Error(`Unsupported file type: ${filePath}`);
  }

  const parser = getParser(lang);
  const startTime = performance.now();
  const tree = parser.parse(source);
  const parseTimeMs = performance.now() - startTime;

  return {
    tree,
    language: lang,
    filePath,
    parseTimeMs,
  };
}

/**
 * Parse a file from disk
 */
export async function parseFile(filePath: string): Promise<ParseResult> {
  const fs = await import('fs/promises');
  const source = await fs.readFile(filePath, 'utf-8');
  return parseSource(source, filePath);
}

/**
 * Re-export tree-sitter types for use in extractor
 */
export type { Parser };
export type SyntaxNode = Parser.SyntaxNode;
export type Tree = Parser.Tree;
