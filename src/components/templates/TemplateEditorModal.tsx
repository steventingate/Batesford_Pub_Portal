import { useEffect, useRef } from 'react';

type TemplateEditorModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

const focusableSelector =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function TemplateEditorModal({ open, onClose, children }: TemplateEditorModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    if (panel) {
      const focusTarget =
        panel.querySelector<HTMLElement>('[data-autofocus="true"]') ??
        panel.querySelector<HTMLElement>(focusableSelector);
      focusTarget?.focus();
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        ref={panelRef}
        className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl"
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
