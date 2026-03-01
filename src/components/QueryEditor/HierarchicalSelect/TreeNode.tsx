import { useRef, useEffect } from 'react';
import type { NaicsTreeNode } from './useNaicsTree';
import { getCheckState, getAllDescendantCodes } from './useNaicsTree';

interface TreeNodeProps {
  node: NaicsTreeNode;
  depth: number;
  expandedNodes: Set<string>;
  allSelectedCodes: Set<string>;
  isAncestorSelected: boolean;
  onToggleExpand: (code: string) => void;
  onToggleSelect: (code: string) => void;
}

export function TreeNode({
  node,
  depth,
  expandedNodes,
  allSelectedCodes,
  isAncestorSelected,
  onToggleExpand,
  onToggleSelect,
}: TreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedNodes.has(node.code);
  const checkState = getCheckState(node, allSelectedCodes);
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = checkState === 'indeterminate';
    }
  }, [checkState]);

  const isDisabled = isAncestorSelected;
  const isThisOrAncestorSelected =
    isAncestorSelected ||
    (checkState === 'checked' &&
      getAllDescendantCodes(node).every((c) => allSelectedCodes.has(c)));

  return (
    <>
      <div
        className="hs-tree-node"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {hasChildren ? (
          <button
            className={`hs-tree-arrow ${isExpanded ? 'hs-tree-arrow--open' : ''}`}
            onClick={() => onToggleExpand(node.code)}
            tabIndex={-1}
            type="button"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        ) : (
          <span className="hs-tree-arrow hs-tree-arrow--empty" />
        )}

        <label className="hs-tree-label">
          <input
            ref={checkboxRef}
            type="checkbox"
            className="hs-tree-checkbox"
            checked={checkState === 'checked'}
            disabled={isDisabled}
            onChange={() => onToggleSelect(node.code)}
          />
          <span>{node.code} - {node.label}</span>
        </label>
      </div>

      {hasChildren && isExpanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.code}
            node={child}
            depth={depth + 1}
            expandedNodes={expandedNodes}
            allSelectedCodes={allSelectedCodes}
            isAncestorSelected={isThisOrAncestorSelected}
            onToggleExpand={onToggleExpand}
            onToggleSelect={onToggleSelect}
          />
        ))
      }
    </>
  );
}
