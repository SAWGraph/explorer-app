import { useState, useRef, useEffect } from 'react';
import { exportMapAsJpg } from '../../utils/exportMap';

export function ExportDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleExportJpg = async () => {
    setOpen(false);
    await exportMapAsJpg();
  };

  return (
    <div className="export-dropdown" ref={ref}>
      <button className="btn-secondary" onClick={() => setOpen((v) => !v)}>
        Export
      </button>
      {open && (
        <div className="export-dropdown-menu">
          <button className="export-dropdown-item" onClick={handleExportJpg}>
            As JPG
          </button>
        </div>
      )}
    </div>
  );
}
