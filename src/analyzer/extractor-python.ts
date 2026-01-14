/**
 * Python-specific AST extraction
 * Handles Python's tree-sitter node types
 */

import { createHash } from 'crypto';
import type { SyntaxNode } from './tree-sitter.js';
import type { GraphNode, GraphEdge, NodeKind } from '../types/index.js';
import type { ExtractionResult, UnresolvedCall } from './extractor.js';

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

function generateStableId(filePath: string, kind: NodeKind, name: string): string {
  const fileHash = hashString(filePath);
  return `${fileHash}:${kind}:${name}`;
}

function generateEdgeId(source: string, target: string, type: string): string {
  return `${source}->${target}:${type}`;
}

/**
 * Calculate content hash for a Python function node
 * Used for annotation staleness detection
 */
function calculateContentHash(node: SyntaxNode): string {
  const body = node.childForFieldName('body');
  const bodyText = body?.text ?? '';
  const params = node.childForFieldName('parameters');
  const paramsText = params?.text ?? '';
  return hashString(paramsText + bodyText);
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
    preview += '\n    # ...';
  }

  return preview.trim() || undefined;
}

/**
 * Extract docstring from Python function
 * Python docstrings are the first statement if it's a string literal
 */
function extractDocstring(node: SyntaxNode): string | undefined {
  const body = node.childForFieldName('body');
  if (!body) return undefined;

  // Look for first child that is an expression_statement containing a string
  for (const child of body.children) {
    if (child.type === 'expression_statement') {
      const stringNode = child.children.find(c =>
        c.type === 'string' || c.type === 'concatenated_string'
      );
      if (stringNode) {
        // Remove quotes and clean up
        let docstring = stringNode.text;
        // Remove triple quotes
        docstring = docstring.replace(/^('''|""")/, '').replace(/('''|""")$/, '');
        // Remove single quotes if single-line
        docstring = docstring.replace(/^['"]/, '').replace(/['"]$/, '');
        // Clean up indentation
        const lines = docstring.split('\n').map(line => line.trim());
        return lines.join('\n').trim() || undefined;
      }
    }
    // If first child isn't a docstring, stop looking
    break;
  }

  return undefined;
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
  if (lowerPath.includes('/test/') || lowerPath.includes('_test.') || lowerPath.includes('test_')) return 'Tests';
  if (lowerPath.includes('/config/')) return 'Config';
  if (lowerPath.includes('/services/')) return 'Services';
  if (lowerPath.includes('/models/')) return 'Models';
  if (lowerPath.includes('/controllers/')) return 'Controllers';
  if (lowerPath.includes('/middleware/')) return 'Middleware';
  if (lowerPath.includes('/routes/')) return 'Routes';
  if (lowerPath.includes('/views/')) return 'Views';
  if (lowerPath.includes('/handlers/')) return 'Handlers';

  return undefined;
}

// ============================================
// Main Python Extractor
// ============================================

export function extractFromPythonAST(root: SyntaxNode, filePath: string): ExtractionResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const functionIndex = new Map<string, string>();
  const unresolvedCalls: UnresolvedCall[] = [];

  // Module node
  const moduleName = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? filePath;
  const moduleId = generateNodeId(filePath, 'module', moduleName, '');
  const moduleStableId = generateStableId(filePath, 'module', moduleName);
  nodes.push({
    id: moduleId,
    stableId: moduleStableId,
    kind: 'module',
    name: moduleName,
    filePath,
    location: { startLine: 1, endLine: 1, startCol: 0, endCol: 0 },
    exported: true,
  });

  // Track function context for call extraction
  const nodeParent = new Map<SyntaxNode, string>();

  // ========================================
  // Phase 1: Index all declarations
  // ========================================

  function phase1(node: SyntaxNode, parentFuncId: string | null): void {
    let currentFuncId = parentFuncId;

    // Handle decorated definitions (unwrap the decorator)
    if (node.type === 'decorated_definition') {
      const definition = node.childForFieldName('definition');
      if (definition) {
        phase1(definition, parentFuncId);
      }
      return;
    }

    // Functions
    if (node.type === 'function_definition') {
      const funcInfo = extractPythonFunction(node, filePath);
      if (funcInfo) {
        nodes.push(funcInfo.node);
        functionIndex.set(funcInfo.node.name, funcInfo.node.id);
        currentFuncId = funcInfo.node.id;
        nodeParent.set(node, funcInfo.node.id);
      }
    }

    // Classes
    if (node.type === 'class_definition') {
      const classInfo = extractPythonClass(node, filePath);
      if (classInfo) {
        nodes.push(classInfo.node);
        functionIndex.set(classInfo.node.name, classInfo.node.id);
        currentFuncId = classInfo.node.id;
        nodeParent.set(node, classInfo.node.id);
      }
    }

    // Imports
    if (node.type === 'import_statement' || node.type === 'import_from_statement') {
      extractPythonImport(node, moduleId, edges, functionIndex);
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

    // Update context if entering a function
    if (nodeParent.has(node)) {
      currentContaining = nodeParent.get(node)!;
    }

    // Call expressions
    if (node.type === 'call') {
      extractPythonCall(node, currentContaining, edges, functionIndex, unresolvedCalls);
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
// Python Function Extraction
// ============================================

function extractPythonFunction(node: SyntaxNode, filePath: string): { node: GraphNode } | null {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return null;

  const name = nameNode.text;
  const params = extractPythonParameters(node);
  const returnType = extractPythonReturnType(node);
  const signature = buildPythonSignature(params, returnType);

  // Check if it's a method (inside a class)
  const isMethod = isInsideClass(node);
  const kind: NodeKind = isMethod ? 'method' : 'function';

  const nodeId = generateNodeId(filePath, kind, name, signature);
  const stableId = generateStableId(filePath, kind, name);

  // Extract source preview and docstring
  const sourcePreview = extractSourcePreview(node);
  const description = extractDocstring(node);
  const category = inferCategory(filePath);
  const contentHash = calculateContentHash(node);

  return {
    node: {
      id: nodeId,
      stableId,
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
      exported: !name.startsWith('_'),  // Python convention: _ prefix = private
      sourcePreview,
      description,
      category,
      contentHash,
    },
  };
}

function extractPythonParameters(node: SyntaxNode): Array<{ name: string; type?: string }> {
  const params: Array<{ name: string; type?: string }> = [];
  const paramsNode = node.childForFieldName('parameters');
  if (!paramsNode) return params;

  for (const child of paramsNode.children) {
    // Regular parameter
    if (child.type === 'identifier') {
      // Skip 'self' and 'cls'
      if (child.text !== 'self' && child.text !== 'cls') {
        params.push({ name: child.text });
      }
    }
    // Typed parameter
    if (child.type === 'typed_parameter') {
      const nameNode = child.children.find(c => c.type === 'identifier');
      const typeNode = child.childForFieldName('type');
      if (nameNode && nameNode.text !== 'self' && nameNode.text !== 'cls') {
        params.push({ name: nameNode.text, type: typeNode?.text });
      }
    }
    // Default parameter
    if (child.type === 'default_parameter') {
      const nameNode = child.childForFieldName('name');
      if (nameNode && nameNode.text !== 'self' && nameNode.text !== 'cls') {
        params.push({ name: nameNode.text });
      }
    }
    // Typed default parameter
    if (child.type === 'typed_default_parameter') {
      const nameNode = child.childForFieldName('name');
      const typeNode = child.childForFieldName('type');
      if (nameNode && nameNode.text !== 'self' && nameNode.text !== 'cls') {
        params.push({ name: nameNode.text, type: typeNode?.text });
      }
    }
  }

  return params;
}

function extractPythonReturnType(node: SyntaxNode): string | undefined {
  const returnType = node.childForFieldName('return_type');
  return returnType?.text;
}

function buildPythonSignature(
  params: Array<{ name: string; type?: string }>,
  returnType?: string
): string {
  const paramStr = params.map(p => p.type ? `${p.name}: ${p.type}` : p.name).join(', ');
  return returnType ? `(${paramStr}) -> ${returnType}` : `(${paramStr})`;
}

function isInsideClass(node: SyntaxNode): boolean {
  let current = node.parent;
  while (current) {
    if (current.type === 'class_definition') return true;
    if (current.type === 'module') return false;
    current = current.parent;
  }
  return false;
}

// ============================================
// Python Class Extraction
// ============================================

function extractPythonClass(node: SyntaxNode, filePath: string): { node: GraphNode } | null {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return null;

  const name = nameNode.text;
  const nodeId = generateNodeId(filePath, 'class', name, '');
  const stableId = generateStableId(filePath, 'class', name);

  // Extract class docstring
  const description = extractDocstring(node);
  const category = inferCategory(filePath);

  return {
    node: {
      id: nodeId,
      stableId,
      kind: 'class',
      name,
      filePath,
      location: {
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        startCol: node.startPosition.column,
        endCol: node.endPosition.column,
      },
      exported: !name.startsWith('_'),
      description,
      category,
    },
  };
}

// ============================================
// Python Import Extraction
// ============================================

function extractPythonImport(
  node: SyntaxNode,
  moduleId: string,
  edges: GraphEdge[],
  functionIndex: Map<string, string>
): void {
  if (node.type === 'import_statement') {
    // import foo, bar
    for (const child of node.children) {
      if (child.type === 'dotted_name') {
        const moduleName = child.text;
        const importedModuleId = `import:${moduleName}`;
        edges.push({
          id: generateEdgeId(moduleId, importedModuleId, 'imports'),
          source: moduleId,
          target: importedModuleId,
          type: 'imports',
          confidence: 'exact',
          label: moduleName,
        });
        functionIndex.set(moduleName.split('.')[0], `${importedModuleId}:*`);
      }
      if (child.type === 'aliased_import') {
        const nameNode = child.childForFieldName('name');
        const aliasNode = child.childForFieldName('alias');
        if (nameNode) {
          const moduleName = nameNode.text;
          const importedModuleId = `import:${moduleName}`;
          edges.push({
            id: generateEdgeId(moduleId, importedModuleId, 'imports'),
            source: moduleId,
            target: importedModuleId,
            type: 'imports',
            confidence: 'exact',
            label: moduleName,
          });
          const localName = aliasNode?.text ?? moduleName.split('.')[0];
          functionIndex.set(localName, `${importedModuleId}:*`);
        }
      }
    }
  }

  if (node.type === 'import_from_statement') {
    // from foo import bar, baz
    const moduleNode = node.childForFieldName('module_name');
    if (!moduleNode) return;

    const moduleName = moduleNode.text;
    const importedModuleId = `import:${moduleName}`;

    edges.push({
      id: generateEdgeId(moduleId, importedModuleId, 'imports'),
      source: moduleId,
      target: importedModuleId,
      type: 'imports',
      confidence: 'exact',
      label: moduleName,
    });

    // Index imported names
    for (const child of node.children) {
      if (child.type === 'dotted_name' && child !== moduleNode) {
        functionIndex.set(child.text, `${importedModuleId}:${child.text}`);
      }
      if (child.type === 'aliased_import') {
        const nameNode = child.childForFieldName('name');
        const aliasNode = child.childForFieldName('alias');
        if (nameNode) {
          const localName = aliasNode?.text ?? nameNode.text;
          functionIndex.set(localName, `${importedModuleId}:${nameNode.text}`);
        }
      }
    }
  }
}

// ============================================
// Python Call Extraction
// ============================================

function extractPythonCall(
  node: SyntaxNode,
  callerNodeId: string,
  edges: GraphEdge[],
  functionIndex: Map<string, string>,
  unresolvedCalls: UnresolvedCall[]
): void {
  const callSite = { line: node.startPosition.row + 1, col: node.startPosition.column };
  const funcNode = node.childForFieldName('function');
  if (!funcNode) return;

  if (funcNode.type === 'attribute') {
    // Method call: obj.method()
    const attrNode = funcNode.childForFieldName('attribute');
    const objectNode = funcNode.childForFieldName('object');
    if (attrNode) {
      unresolvedCalls.push({
        callerNodeId,
        calleeName: attrNode.text,
        callSite,
        isMethodCall: true,
        objectExpr: objectNode?.text,
      });
    }
  } else if (funcNode.type === 'identifier') {
    // Direct call: func()
    const funcName = funcNode.text;
    const targetId = functionIndex.get(funcName);

    if (targetId && !targetId.startsWith('import:')) {
      edges.push({
        id: generateEdgeId(callerNodeId, targetId, 'calls'),
        source: callerNodeId,
        target: targetId,
        type: 'calls',
        confidence: 'exact',
        callSite,
      });
    } else {
      unresolvedCalls.push({
        callerNodeId,
        calleeName: funcName,
        callSite,
        isMethodCall: false,
      });
    }
  }
}
