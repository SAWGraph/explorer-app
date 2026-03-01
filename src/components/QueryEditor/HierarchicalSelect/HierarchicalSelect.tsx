import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { NaicsIndustry } from '../../../constants/naics';
import { useNaicsTree, getAllDescendantCodes } from './useNaicsTree';
import { TreeNode } from './TreeNode';

interface HierarchicalSelectProps {
  industries: NaicsIndustry[];
  selectedCodes: string[];
  onChange: (codes: string[], labels: Record<string, string>) => void;
  placeholder?: string;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  direction: 'down' | 'up';
}

export function HierarchicalSelect({
  industries,
  selectedCodes,
  onChange,
  placeholder = 'Any industry...',
}: HierarchicalSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [resizeTick, setResizeTick] = useState(0);

  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { roots, nodeMap, userSelections } = useNaicsTree(industries, selectedCodes);

  const allSelectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  // Compute position as derived data (recalculates when isOpen or resizeTick changes)
  const position: DropdownPosition | null = useMemo(() => {
    if (!isOpen || !triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const direction: 'down' | 'up' = spaceBelow < 250 ? 'up' : 'down';
    return {
      top: direction === 'down' ? rect.bottom + 2 : rect.top - 2,
      left: rect.left,
      width: rect.width,
      direction,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, resizeTick]);

  // Reposition on window resize
  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => setResizeTick((t) => t + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      )
        return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Close on Escape (capture phase to prevent modal from also closing)
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [isOpen]);

  // Close on modal scroll
  useEffect(() => {
    if (!isOpen) return;
    const modalBody = triggerRef.current?.closest('.modal-body');
    if (!modalBody) return;
    const handleScroll = () => setIsOpen(false);
    modalBody.addEventListener('scroll', handleScroll);
    return () => modalBody.removeEventListener('scroll', handleScroll);
  }, [isOpen]);

  const handleToggleExpand = useCallback((code: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const buildLabels = useCallback(
    (selections: Set<string>): Record<string, string> => {
      const labels: Record<string, string> = {};
      for (const code of selections) {
        const node = nodeMap.get(code);
        if (node) labels[code] = node.label;
      }
      return labels;
    },
    [nodeMap]
  );

  const handleToggleSelect = useCallback(
    (code: string) => {
      const node = nodeMap.get(code);
      if (!node) return;

      const newUserSelections = new Set(userSelections);
      const descendantCodes = getAllDescendantCodes(node);

      if (userSelections.has(code)) {
        // Deselect: remove this node
        newUserSelections.delete(code);
      } else {
        // Select: add this node, remove any descendants that were individually selected
        newUserSelections.add(code);
        for (const dc of descendantCodes) {
          if (dc !== code) newUserSelections.delete(dc);
        }
      }

      onChange(Array.from(newUserSelections), buildLabels(newUserSelections));
    },
    [nodeMap, userSelections, onChange, buildLabels]
  );

  const handleRemoveChip = useCallback(
    (code: string) => {
      const newUserSelections = new Set(userSelections);
      newUserSelections.delete(code);
      onChange(Array.from(newUserSelections), buildLabels(newUserSelections));
    },
    [userSelections, onChange, buildLabels]
  );

  const handleClearAll = useCallback(() => {
    onChange([], {});
  }, [onChange]);

  // Build chip data from userSelections
  const chips = useMemo(() => {
    const result: { code: string; label: string }[] = [];
    for (const code of userSelections) {
      const node = nodeMap.get(code);
      if (node) {
        result.push({ code: node.code, label: node.label });
      }
    }
    return result.sort((a, b) => a.code.localeCompare(b.code));
  }, [userSelections, nodeMap]);

  const hasValue = chips.length > 0;

  const dropdownStyle: React.CSSProperties | undefined = position
    ? {
        position: 'fixed',
        left: position.left,
        width: position.width,
        zIndex: 1100,
        ...(position.direction === 'down'
          ? { top: position.top }
          : { bottom: window.innerHeight - position.top }),
      }
    : undefined;

  return (
    <div className="hs-container" ref={triggerRef}>
      <div
        className={`hs-control ${isOpen ? 'hs-control--focused' : ''}`}
        onClick={() => setIsOpen((o) => !o)}
      >
        <div className="hs-value-container">
          {!hasValue && <span className="hs-placeholder">{placeholder}</span>}
          {chips.map((chip) => (
            <span key={chip.code} className="hs-chip">
              <span className="hs-chip-label">
                {chip.code} - {chip.label}
              </span>
              <button
                className="hs-chip-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveChip(chip.code);
                }}
                type="button"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <div className="hs-indicators">
          {hasValue && (
            <button
              className="hs-clear"
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
              }}
              type="button"
            >
              &times;
            </button>
          )}
          <span className="hs-separator" />
          <span className="hs-dropdown-arrow">
            <svg width="16" height="16" viewBox="0 0 20 20">
              <path d="M4.516 7.548c.436-.446 1.043-.481 1.576 0L10 11.295l3.908-3.747c.533-.481 1.141-.446 1.574 0 .436.445.408 1.197 0 1.615l-4.695 4.502c-.217.223-.502.335-.787.335s-.57-.112-.789-.335L4.516 9.163c-.408-.418-.436-1.17 0-1.615z" fill="currentColor" />
            </svg>
          </span>
        </div>
      </div>

      {isOpen &&
        createPortal(
          <div
            className="hs-dropdown"
            ref={dropdownRef}
            style={dropdownStyle}
          >
            {roots.length === 0 ? (
              <div className="hs-empty">No industries available</div>
            ) : (
              roots.map((node) => (
                <TreeNode
                  key={node.code}
                  node={node}
                  depth={0}
                  expandedNodes={expandedNodes}
                  allSelectedCodes={allSelectedSet}
                  isAncestorSelected={false}
                  onToggleExpand={handleToggleExpand}
                  onToggleSelect={handleToggleSelect}
                />
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
