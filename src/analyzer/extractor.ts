/**
 * AST Extractor: Walks tree-sitter AST and extracts code elements
 * Two-phase approach:
 *   Phase 1: Index all declarations (functions, classes)
 *   Phase 2: Extract calls and resolve references
 *
 * Supports: TypeScript, JavaScript, Python
 */

import { createHash } from 'crypto';
import type { SyntaxNode } from './tree-sitter.js';
import type { SupportedLanguage } from './tree-sitter.js';
import type { GraphNode, GraphEdge, NodeKind } from '../types/index.js';
import { extractFromPythonAST } from './extractor-python.js';

// ============================================
// Unified Extractor (dispatches by language)
// ============================================

export function extractFromAST(
  root: SyntaxNode,
  filePath: string,
  language?: SupportedLanguage
): ExtractionResult {
  // Infer language from file path if not provided
  const lang = language ?? inferLanguageFromPath(filePath);

  if (lang === 'python') {
    return extractFromPythonAST(root, filePath);
  }

  // Default to TypeScript/JavaScript extraction
  return extractFromTypeScriptAST(root, filePath);
}

function inferLanguageFromPath(filePath: string): SupportedLanguage {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'py') return 'python';
  return 'typescript'; // Default
}

// ============================================
// Extraction Result
// ============================================

export interface ExtractionResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  functionIndex: Map<string, string>;
  unresolvedCalls: UnresolvedCall[];
}

export interface UnresolvedCall {
  callerNodeId: string;
  calleeName: string;
  callSite: { line: number; col: number };
  isMethodCall: boolean;
  objectExpr?: string;
}

// ============================================
// Helpers
// ============================================

function hashString(str: string): string {
  return createHash('sha256').update(str).digest('hex').slice(0, 8);
}

function generateNodeId(filePath: string, kind: NodeKind, name: string, signature: string): string {
  const fileHash = hashString(filePath);
  const sigHash = hashString(signature);
  return `${fileHash}:${kind}:${name}:${sigHash}`;
}

function generateEdgeId(source: string, target: string, type: string): string {
  return `${source}->${target}:${type}`;
}

// ============================================
// Source Preview & Description Extraction
// ============================================

const PREVIEW_LINES = 12;

/**
 * Extract first N lines of function body as source preview
 */
function extractSourcePreview(node: SyntaxNode): string | undefined {
  const body = node.childForFieldName('body');
  if (!body) return undefined;

  const bodyText = body.text;
  if (!bodyText) return undefined;

  // Split into lines, take first N, join back
  const lines = bodyText.split('\n');
  const previewLines = lines.slice(0, PREVIEW_LINES);

  // If we truncated, add ellipsis indicator
  let preview = previewLines.join('\n');
  if (lines.length > PREVIEW_LINES) {
    preview += '\n  // ...';
  }

  return preview.trim() || undefined;
}

/**
 * Extract JSDoc description from comment preceding the function
 */
function extractJSDocDescription(node: SyntaxNode): string | undefined {
  // Look for comment in previous siblings
  let sibling = node.previousSibling;

  // Skip whitespace/newlines to find comment
  while (sibling && sibling.type === 'comment' && !sibling.text.startsWith('/**')) {
    sibling = sibling.previousSibling;
  }

  if (!sibling || sibling.type !== 'comment') {
    // Check parent for export_statement wrapping
    const parent = node.parent;
    if (parent?.type === 'export_statement') {
      sibling = parent.previousSibling;
      while (sibling && sibling.type === 'comment' && !sibling.text.startsWith('/**')) {
        sibling = sibling.previousSibling;
      }
    }
  }

  if (!sibling || sibling.type !== 'comment') return undefined;

  const commentText = sibling.text;
  if (!commentText.startsWith('/**')) return undefined;

  // Parse JSDoc - extract description (first paragraph before @tags)
  const content = commentText
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map(line => line.replace(/^\s*\*\s?/, ''))
    .join('\n')
    .trim();

  // Get content before first @tag
  const atIndex = content.indexOf('@');
  const description = atIndex >= 0 ? content.slice(0, atIndex).trim() : content;

  return description || undefined;
}

/**
 * Infer category from file path
 */
function inferCategory(filePath: string): string | undefined {
  const lowerPath = filePath.toLowerCase();

  // Common patterns
  if (lowerPath.includes('/hooks/') || lowerPath.includes('/hook')) return 'Hooks';
  if (lowerPath.includes('/components/') || lowerPath.includes('/component')) return 'Components';
  if (lowerPath.includes('/server/') || lowerPath.includes('/api/')) return 'Server';
  if (lowerPath.includes('/analyzer/') || lowerPath.includes('/analysis/')) return 'Analysis';
  if (lowerPath.includes('/graph/')) return 'Graph';
  if (lowerPath.includes('/storage/') || lowerPath.includes('/db/')) return 'Storage';
  if (lowerPath.includes('/utils/') || lowerPath.includes('/helpers/')) return 'Utils';
  if (lowerPath.includes('/lib/')) return 'Lib';
  if (lowerPath.includes('/types/')) return 'Types';
  if (lowerPath.includes('/test/') || lowerPath.includes('.test.') || lowerPath.includes('.spec.')) return 'Tests';
  if (lowerPath.includes('/config/')) return 'Config';
  if (lowerPath.includes('/services/')) return 'Services';
  if (lowerPath.includes('/models/')) return 'Models';
  if (lowerPath.includes('/controllers/')) return 'Controllers';
  if (lowerPath.includes('/middleware/')) return 'Middleware';
  if (lowerPath.includes('/routes/')) return 'Routes';

  return undefined;
}

// ============================================
// TypeScript/JavaScript Extractor
// ============================================

function extractFromTypeScriptAST(root: SyntaxNode, filePath: string): ExtractionResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const functionIndex = new Map<string, string>();
  const unresolvedCalls: UnresolvedCall[] = [];

  // Module node
  const moduleName = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? filePath;
  const moduleId = generateNodeId(filePath, 'module', moduleName, '');
  nodes.push({
    id: moduleId,
    kind: 'module',
    name: moduleName,
    filePath,
    location: { startLine: 1, endLine: 1, startCol: 0, endCol: 0 },
    exported: true,
  });

  // Track which function contains each node for call context
  const nodeParent = new Map<SyntaxNode, string>(); // AST node -> containing function's nodeId

  // ========================================
  // Phase 1: Index all declarations
  // ========================================

  function phase1(node: SyntaxNode, parentFuncId: string | null): void {
    let currentFuncId = parentFuncId;

    // Functions
    if (isFunctionNode(node)) {
      const funcInfo = extractFunctionInfo(node, filePath);
      if (funcInfo) {
        nodes.push(funcInfo.node);
        functionIndex.set(funcInfo.node.name, funcInfo.node.id);
        currentFuncId = funcInfo.node.id;
        nodeParent.set(node, funcInfo.node.id);
      }
    }

    // Classes
    if (isClassNode(node)) {
      const classInfo = extractClassInfo(node, filePath);
      if (classInfo) {
        nodes.push(classInfo.node);
        functionIndex.set(classInfo.node.name, classInfo.node.id);
        currentFuncId = classInfo.node.id;
        nodeParent.set(node, classInfo.node.id);
      }
    }

    // Imports
    if (node.type === 'import_statement') {
      extractImport(node, moduleId, edges, functionIndex);
    }

    // Recurse
    for (const child of node.children) {
      phase1(child, currentFuncId);
    }
  }

  // ========================================
  // Phase 2: Extract calls
  // ========================================

  function phase2(node: SyntaxNode, containingFuncId: string): void {
    let currentContaining = containingFuncId;

    // Update context if we're entering a function
    if (nodeParent.has(node)) {
      currentContaining = nodeParent.get(node)!;
    }

    // Call expressions
    if (node.type === 'call_expression') {
      extractCall(node, currentContaining, edges, functionIndex, unresolvedCalls);
    }

    // New expressions (instantiation)
    if (node.type === 'new_expression') {
      extractNew(node, currentContaining, edges, functionIndex, unresolvedCalls);
    }

    // Recurse
    for (const child of node.children) {
      phase2(child, currentContaining);
    }
  }

  // Run phases
  phase1(root, null);
  phase2(root, moduleId);

  return { nodes, edges, functionIndex, unresolvedCalls };
}

// ============================================
// Node Type Checks
// ============================================

function isFunctionNode(node: SyntaxNode): boolean {
  return [
    'function_declaration',
    'function_expression',
    'arrow_function',
    'method_definition',
  ].includes(node.type);
}

function isClassNode(node: SyntaxNode): boolean {
  return ['class_declaration', 'class_expression'].includes(node.type);
}

// ============================================
// Function Extraction
// ============================================

function extractFunctionInfo(node: SyntaxNode, filePath: string): { node: GraphNode } | null {
  const name = getFunctionName(node);
  if (!name) return null;

  const params = extractParameters(node);
  const returnType = extractReturnType(node);
  const signature = buildSignature(params, returnType);
  const exported = isExported(node);
  const kind: NodeKind = node.type === 'method_definition' ? 'method' : 'function';

  const nodeId = generateNodeId(filePath, kind, name, signature);

  // Extract source preview and description
  const sourcePreview = extractSourcePreview(node);
  const description = extractJSDocDescription(node);
  const category = inferCategory(filePath);

  return {
    node: {
      id: nodeId,
      kind,
      name,
      filePath,
      location: {
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        startCol: node.startPosition.column,
        endCol: node.endPosition.column,
      },
      signature,
      params,
      returnType,
      exported,
      sourcePreview,
      description,
      category,
    },
  };
}

function getFunctionName(node: SyntaxNode): string | null {
  // Direct name
  const nameNode = node.childForFieldName('name');
  if (nameNode) return nameNode.text;

  // Variable assignment: const foo = () => {}
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') {
    const varName = parent.childForFieldName('name');
    if (varName) return varName.text;
  }

  // Object property: { foo: () => {} }
  if (parent?.type === 'pair') {
    const key = parent.childForFieldName('key');
    if (key) return key.text;
  }

  return null;
}

function extractParameters(node: SyntaxNode): Array<{ name: string; type?: string }> {
  const params: Array<{ name: string; type?: string }> = [];
  const paramsNode = node.childForFieldName('parameters');
  if (!paramsNode) return params;

  for (const param of paramsNode.children) {
    if (['required_parameter', 'optional_parameter'].includes(param.type)) {
      const nameNode = param.childForFieldName('pattern') ?? param.childForFieldName('name');
      const typeNode = param.childForFieldName('type');
      if (nameNode) {
        params.push({ name: nameNode.text, type: typeNode?.text });
      }
    } else if (param.type === 'identifier') {
      params.push({ name: param.text });
    }
  }

  return params;
}

function extractReturnType(node: SyntaxNode): string | undefined {
  return node.childForFieldName('return_type')?.text;
}

function buildSignature(params: Array<{ name: string; type?: string }>, returnType?: string): string {
  const paramStr = params.map(p => p.type ? `${p.name}: ${p.type}` : p.name).join(', ');
  return returnType ? `(${paramStr}): ${returnType}` : `(${paramStr})`;
}

function isExported(node: SyntaxNode): boolean {
  let current = node.parent;
  while (current) {
    if (current.type === 'export_statement') return true;
    if (current.type === 'program') break;
    current = current.parent;
  }
  return false;
}

// ============================================
// Class Extraction
// ============================================

function extractClassInfo(node: SyntaxNode, filePath: string): { node: GraphNode } | null {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return null;

  const name = nameNode.text;
  const exported = isExported(node);
  const nodeId = generateNodeId(filePath, 'class', name, '');

  // Extract description from JSDoc
  const description = extractJSDocDescription(node);
  const category = inferCategory(filePath);

  return {
    node: {
      id: nodeId,
      kind: 'class',
      name,
      filePath,
      location: {
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        startCol: node.startPosition.column,
        endCol: node.endPosition.column,
      },
      exported,
      description,
      category,
    },
  };
}

// ============================================
// Import Extraction
// ============================================

function extractImport(
  node: SyntaxNode,
  moduleId: string,
  edges: GraphEdge[],
  functionIndex: Map<string, string>
): void {
  const sourceNode = node.childForFieldName('source');
  if (!sourceNode) return;

  const source = sourceNode.text.replace(/['"]/g, '');
  const importedModuleId = `import:${source}`;

  edges.push({
    id: generateEdgeId(moduleId, importedModuleId, 'imports'),
    source: moduleId,
    target: importedModuleId,
    type: 'imports',
    confidence: 'exact',
    label: source,
  });

  // Index imported names for call resolution
  const clause = node.children.find(c => c.type === 'import_clause');
  if (clause) {
    // Default import
    const defaultImport = clause.children.find(c => c.type === 'identifier');
    if (defaultImport) {
      functionIndex.set(defaultImport.text, `${importedModuleId}:default`);
    }

    // Named imports
    const namedImports = clause.children.find(c => c.type === 'named_imports');
    if (namedImports) {
      for (const specifier of namedImports.children) {
        if (specifier.type === 'import_specifier') {
          const name = specifier.childForFieldName('name') ?? specifier.children.find(c => c.type === 'identifier');
          const alias = specifier.childForFieldName('alias');
          if (name) {
            const localName = alias?.text ?? name.text;
            functionIndex.set(localName, `${importedModuleId}:${name.text}`);
          }
        }
      }
    }

    // Namespace import
    const namespaceImport = clause.children.find(c => c.type === 'namespace_import');
    if (namespaceImport) {
      const alias = namespaceImport.children.find(c => c.type === 'identifier');
      if (alias) {
        functionIndex.set(alias.text, `${importedModuleId}:*`);
      }
    }
  }
}

// ============================================
// Call Extraction
// ============================================

function extractCall(
  node: SyntaxNode,
  callerNodeId: string,
  edges: GraphEdge[],
  functionIndex: Map<string, string>,
  unresolvedCalls: UnresolvedCall[]
): void {
  const callSite = { line: node.startPosition.row + 1, col: node.startPosition.column };
  const funcNode = node.childForFieldName('function');
  if (!funcNode) return;

  if (funcNode.type === 'member_expression') {
    // Method call: obj.method()
    const property = funcNode.childForFieldName('property');
    const object = funcNode.childForFieldName('object');
    if (property) {
      unresolvedCalls.push({
        callerNodeId,
        calleeName: property.text,
        callSite,
        isMethodCall: true,
        objectExpr: object?.text,
      });
    }
  } else if (funcNode.type === 'identifier') {
    // Direct call: func()
    const funcName = funcNode.text;
    const targetId = functionIndex.get(funcName);

    if (targetId && !targetId.startsWith('import:')) {
      // Local function - create edge
      edges.push({
        id: generateEdgeId(callerNodeId, targetId, 'calls'),
        source: callerNodeId,
        target: targetId,
        type: 'calls',
        confidence: 'exact',
        callSite,
      });
    } else {
      // External or not found - add to unresolved
      unresolvedCalls.push({
        callerNodeId,
        calleeName: funcName,
        callSite,
        isMethodCall: false,
      });
    }
  }
}

function extractNew(
  node: SyntaxNode,
  callerNodeId: string,
  edges: GraphEdge[],
  functionIndex: Map<string, string>,
  unresolvedCalls: UnresolvedCall[]
): void {
  const callSite = { line: node.startPosition.row + 1, col: node.startPosition.column };
  const constructor = node.childForFieldName('constructor');
  if (!constructor) return;

  const className = constructor.text;
  const targetId = functionIndex.get(className);

  if (targetId && !targetId.startsWith('import:')) {
    edges.push({
      id: generateEdgeId(callerNodeId, targetId, 'instantiates'),
      source: callerNodeId,
      target: targetId,
      type: 'instantiates',
      confidence: 'exact',
      callSite,
    });
  } else {
    unresolvedCalls.push({
      callerNodeId,
      calleeName: className,
      callSite,
      isMethodCall: false,
    });
  }
}

// ============================================
// Resolve Local Calls (post-processing)
// ============================================

export function resolveLocalCalls(result: ExtractionResult): {
  resolved: GraphEdge[];
  stillUnresolved: UnresolvedCall[]
} {
  const resolved: GraphEdge[] = [];
  const stillUnresolved: UnresolvedCall[] = [];

  // Build a map of method names to their node IDs for heuristic matching
  const methodIndex = new Map<string, string[]>();
  for (const [name, id] of result.functionIndex) {
    if (!methodIndex.has(name)) {
      methodIndex.set(name, []);
    }
    methodIndex.get(name)!.push(id);
  }

  for (const call of result.unresolvedCalls) {
    const targetId = result.functionIndex.get(call.calleeName);

    if (call.isMethodCall) {
      // Try heuristic: match method call to method definition by name
      const candidates = methodIndex.get(call.calleeName);
      if (candidates && candidates.length > 0) {
        // If only one candidate, use it with high confidence
        // If multiple, use first but mark as heuristic
        const targetId = candidates[0];
        if (!targetId.startsWith('import:')) {
          resolved.push({
            id: generateEdgeId(call.callerNodeId, targetId, 'calls'),
            source: call.callerNodeId,
            target: targetId,
            type: 'calls',
            confidence: candidates.length === 1 ? 'exact' : 'heuristic',
            callSite: call.callSite,
          });
          continue;
        }
      }
      stillUnresolved.push(call);
      continue;
    }

    if (targetId && !targetId.startsWith('import:')) {
      resolved.push({
        id: generateEdgeId(call.callerNodeId, targetId, 'calls'),
        source: call.callerNodeId,
        target: targetId,
        type: 'calls',
        confidence: 'exact',
        callSite: call.callSite,
      });
    } else {
      stillUnresolved.push(call);
    }
  }

  return { resolved, stillUnresolved };
}
