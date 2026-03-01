import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

export interface FlatSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface FlatSelectProps {
  options: FlatSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  isMulti?: boolean;
  placeholder?: string;
  isLoading?: boolean;
  isClearable?: boolean;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  direction: 'down' | 'up';
}

export function FlatSelect({
  options,
  selectedValues,
  onChange,
  isMulti = true,
  placeholder = 'Select...',
  isLoading = false,
  isClearable = true,
}: FlatSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resizeTick, setResizeTick] = useState(0);

  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  // Compute position as derived data
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

  const handleToggleOption = useCallback(
    (value: string, disabled?: boolean) => {
      if (disabled) return;
      if (isMulti) {
        const next = new Set(selectedSet);
        if (next.has(value)) {
          next.delete(value);
        } else {
          next.add(value);
        }
        onChange(Array.from(next));
      } else {
        onChange([value]);
        setIsOpen(false);
      }
    },
    [isMulti, selectedSet, onChange]
  );

  const handleRemoveChip = useCallback(
    (value: string) => {
      onChange(selectedValues.filter((v) => v !== value));
    },
    [selectedValues, onChange]
  );

  const handleClearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const chips = useMemo(() => {
    return options.filter((o) => selectedSet.has(o.value));
  }, [options, selectedSet]);

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
            <span key={chip.value} className="hs-chip">
              <span className="hs-chip-label">{chip.label}</span>
              <button
                className="hs-chip-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveChip(chip.value);
                }}
                type="button"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <div className="hs-indicators">
          {hasValue && isClearable && (
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
            {isLoading ? (
              <div className="hs-loading">Loading…</div>
            ) : options.length === 0 ? (
              <div className="hs-empty">No options available</div>
            ) : (
              options.map((option) => {
                const isSelected = selectedSet.has(option.value);
                const isDisabled = option.disabled === true;
                return (
                  <div
                    key={option.value}
                    className={`hs-flat-option${isSelected ? ' hs-flat-option--selected' : ''}${isDisabled ? ' hs-flat-option--disabled' : ''}`}
                    onClick={() => handleToggleOption(option.value, isDisabled)}
                  >
                    {isMulti && (
                      <input
                        type="checkbox"
                        className="hs-tree-checkbox"
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={() => handleToggleOption(option.value, isDisabled)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <span>{option.label}</span>
                  </div>
                );
              })
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
