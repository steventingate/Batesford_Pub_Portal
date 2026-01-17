import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';

type VariableOption = {
  label: string;
  value: string;
};

type EditorToolbarProps = {
  onCommand: (command: string, value?: string) => void;
  onInsertVariable: (token: string) => void;
  onInsertInlineImage: () => void;
  onSetHeroImage: () => void;
  onSetFooterImage: () => void;
  variableOptions: VariableOption[];
  canUploadAssets: boolean;
};

export function EditorToolbar({
  onCommand,
  onInsertVariable,
  onInsertInlineImage,
  onSetHeroImage,
  onSetFooterImage,
  variableOptions,
  canUploadAssets
}: EditorToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const handleInsertVariableClick = (token: string) => {
    onInsertVariable(token);
    setMenuOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        className="btn-icon"
        onClick={() => onCommand('bold')}
        aria-label="Bold"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6 4.5h5.1a3.4 3.4 0 0 1 0 6.8H6V4.5zm0 7.5h5.6a3.6 3.6 0 0 1 0 7.2H6V12z"
          />
        </svg>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="btn-icon"
        onClick={() => onCommand('italic')}
        aria-label="Italic"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
          <path fill="currentColor" d="M8 4h8v2h-3l-4 8h3v2H4v-2h3l4-8H8z" />
        </svg>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="btn-icon"
        onClick={() => onCommand('insertUnorderedList')}
        aria-label="Bulleted list"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
          <path fill="currentColor" d="M7 6h9v2H7zM7 12h9v2H7zM3 5h2v2H3zM3 11h2v2H3z" />
        </svg>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="btn-icon"
        onClick={() => {
          const url = window.prompt('Enter link URL');
          if (url) onCommand('createLink', url);
        }}
        aria-label="Insert link"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7.5 12.5a3.5 3.5 0 0 1 0-5l2-2a3.5 3.5 0 0 1 5 5l-1.2 1.2-1.4-1.4 1.2-1.2a1.5 1.5 0 0 0-2.1-2.1l-2 2a1.5 1.5 0 1 0 2.1 2.1l.4-.4 1.4 1.4-.4.4a3.5 3.5 0 0 1-5 0z"
          />
          <path
            fill="currentColor"
            d="M12.5 7.5a3.5 3.5 0 0 1 0 5l-2 2a3.5 3.5 0 0 1-5-5l1.2-1.2 1.4 1.4-1.2 1.2a1.5 1.5 0 1 0 2.1 2.1l2-2a1.5 1.5 0 1 0-2.1-2.1l-.4.4-1.4-1.4.4-.4a3.5 3.5 0 0 1 5 0z"
          />
        </svg>
      </Button>

      <div className="relative" ref={menuRef}>
        <Button type="button" variant="outline" onClick={() => setMenuOpen((prev) => !prev)}>
          Insert
        </Button>
        {menuOpen && (
          <div className="absolute left-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-10">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Variables
            </div>
            <div className="grid gap-1">
              {variableOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="flex h-9 items-center rounded-lg px-3 text-left text-sm text-brand hover:bg-slate-50"
                  onClick={() => handleInsertVariableClick(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="my-2 border-t border-slate-100" />
            <div className="grid gap-1">
                <button
                  type="button"
                  className="flex h-9 items-center rounded-lg px-3 text-left text-sm text-brand hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    onInsertInlineImage();
                    setMenuOpen(false);
                  }}
                  disabled={!canUploadAssets}
                >
                  Insert image into body
                </button>
                <button
                  type="button"
                  className="flex h-9 items-center rounded-lg px-3 text-left text-sm text-brand hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    onSetHeroImage();
                    setMenuOpen(false);
                  }}
                  disabled={!canUploadAssets}
                >
                  Set hero image
                </button>
                <button
                  type="button"
                  className="flex h-9 items-center rounded-lg px-3 text-left text-sm text-brand hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    onSetFooterImage();
                    setMenuOpen(false);
                  }}
                  disabled={!canUploadAssets}
              >
                Set footer banner
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
