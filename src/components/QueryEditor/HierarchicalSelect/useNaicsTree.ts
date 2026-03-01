import { useMemo } from 'react';
import type { NaicsIndustry } from '../../../constants/naics';

export interface NaicsTreeNode {
  code: string;
  label: string;
  children: NaicsTreeNode[];
}

export function buildTree(industries: NaicsIndustry[]): {
  roots: NaicsTreeNode[];
  nodeMap: Map<string, NaicsTreeNode>;
} {
  const nodeMap = new Map<string, NaicsTreeNode>();
  const roots: NaicsTreeNode[] = [];

  // Sort shorter codes first so parents exist before children
  const sorted = [...industries].sort(
    (a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code)
  );

  for (const ind of sorted) {
    if (nodeMap.has(ind.code)) continue; // deduplicate

    const node: NaicsTreeNode = {
      code: ind.code,
      label: ind.label,
      children: [],
    };
    nodeMap.set(ind.code, node);

    // Find parent by trimming code one character at a time
    let parentFound = false;
    for (let len = ind.code.length - 1; len >= 1; len--) {
      const prefix = ind.code.substring(0, len);
      const parent = nodeMap.get(prefix);
      if (parent) {
        parent.children.push(node);
        parentFound = true;
        break;
      }
    }
    if (!parentFound) {
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

export function useNaicsTree(industries: NaicsIndustry[], selectedCodes: string[]) {
  const { roots, nodeMap } = useMemo(() => buildTree(industries), [industries]);

  const allSelectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  const userSelections = useMemo(
    () => collapseSelections(allSelectedSet, roots),
    [allSelectedSet, roots]
  );

  return { roots, nodeMap, userSelections };
}
