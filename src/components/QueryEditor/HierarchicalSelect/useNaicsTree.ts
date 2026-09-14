import { useMemo } from 'react';

// Any flat list that forms a tree. NAICS derives the tree from code prefixes;
// callers with no such convention (material types) pass `parent` explicitly.
export interface TreeItem {
  code: string;
  label: string;
  parent?: string;
}

export interface NaicsTreeNode {
  code: string;
  label: string;
  children: NaicsTreeNode[];
}

export function buildTree(items: TreeItem[]): {
  roots: NaicsTreeNode[];
  nodeMap: Map<string, NaicsTreeNode>;
} {
  const nodeMap = new Map<string, NaicsTreeNode>();
  const roots: NaicsTreeNode[] = [];

  // Parents must exist before their children. NAICS has no order worth keeping,
  // so sort shorter codes first. A caller using explicit parents supplies its own
  // order (parents first) and we keep it — material types arrive sorted by count,
  // and sorting them by URI would throw that away.
  const usesExplicitParents = items.some((i) => i.parent !== undefined);
  const sorted = usesExplicitParents
    ? items
    : [...items].sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));

  for (const ind of sorted) {
    if (nodeMap.has(ind.code)) continue; // deduplicate

    const node: NaicsTreeNode = {
      code: ind.code,
      label: ind.label,
      children: [],
    };
    nodeMap.set(ind.code, node);

    // Explicit parent wins; otherwise find it by trimming the code one character
    // at a time (NAICS codes nest by prefix).
    let parent = ind.parent ? nodeMap.get(ind.parent) : undefined;
    for (let len = ind.code.length - 1; !parent && len >= 1; len--) {
      parent = nodeMap.get(ind.code.substring(0, len));
    }
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return { roots, nodeMap };
}

export function getAllDescendantCodes(node: NaicsTreeNode): string[] {
  const result = [node.code];
  for (const child of node.children) {
    result.push(...getAllDescendantCodes(child));
  }
  return result;
}

export function expandSelections(
  userSelections: Set<string>,
  nodeMap: Map<string, NaicsTreeNode>
): string[] {
  const result = new Set<string>();
  for (const code of userSelections) {
    const node = nodeMap.get(code);
    if (node) {
      for (const c of getAllDescendantCodes(node)) {
        result.add(c);
      }
    }
  }
  return Array.from(result);
}

export function collapseSelections(
  allCodes: Set<string>,
  roots: NaicsTreeNode[]
): Set<string> {
  const userSelections = new Set<string>();

  function visit(node: NaicsTreeNode) {
    if (!allCodes.has(node.code)) {
      // Not selected — but children might be
      for (const child of node.children) visit(child);
      return;
    }

    if (node.children.length === 0) {
      // Leaf node that is selected
      userSelections.add(node.code);
      return;
    }

    // Node is selected — always show it as a chip.
    // If all descendants are also selected, this collapses them into the parent.
    // If only some or none are, we still show the parent as explicitly selected.
    userSelections.add(node.code);
  }

  for (const root of roots) visit(root);
  return userSelections;
}

export function getCheckState(
  node: NaicsTreeNode,
  selectedCodes: Set<string>
): 'checked' | 'indeterminate' | 'unchecked' {
  const allDescs = getAllDescendantCodes(node);
  const selectedCount = allDescs.filter((c) => selectedCodes.has(c)).length;
  if (selectedCount === 0) return 'unchecked';
  if (selectedCount === allDescs.length) return 'checked';
  return 'indeterminate';
}

export function filterTree(
  roots: NaicsTreeNode[],
  query: string,
  matchCode = true,
): { roots: NaicsTreeNode[]; expand: Set<string> } {
  const q = query.trim().toLowerCase();
  if (!q) return { roots, expand: new Set() };
  const expand = new Set<string>();

  function visit(node: NaicsTreeNode): NaicsTreeNode | null {
    const selfMatch =
      node.label.toLowerCase().includes(q) ||
      (matchCode && node.code.toLowerCase().includes(q));
    const keptChildren = node.children
      .map(visit)
      .filter((c): c is NaicsTreeNode => c !== null);
    if (!selfMatch && keptChildren.length === 0) return null;
    if (keptChildren.length > 0) expand.add(node.code);
    return { code: node.code, label: node.label, children: keptChildren };
  }

  const out = roots.map(visit).filter((n): n is NaicsTreeNode => n !== null);
  return { roots: out, expand };
}

export function rollupCounts(
  roots: NaicsTreeNode[],
  leafCounts: Record<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  function visit(node: NaicsTreeNode): number {
    let sum = leafCounts[node.code] ?? 0;
    for (const child of node.children) {
      sum += visit(child);
    }
    result.set(node.code, sum);
    return sum;
  }
  for (const r of roots) visit(r);
  return result;
}

export function useNaicsTree(items: TreeItem[], selectedCodes: string[]) {
  const { roots, nodeMap } = useMemo(() => buildTree(items), [items]);

  const allSelectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  const userSelections = useMemo(
    () => collapseSelections(allSelectedSet, roots),
    [allSelectedSet, roots]
  );

  return { roots, nodeMap, userSelections };
}
