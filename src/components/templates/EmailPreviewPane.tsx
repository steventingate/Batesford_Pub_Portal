type DebugSection = {
  label: string;
  content: string;
};

type EmailPreviewPaneProps = {
  subject: string;
  html: string;
  showDebug: boolean;
  onToggleDebug: () => void;
  debugSections?: DebugSection[];
};

export function EmailPreviewPane({
  subject,
  html,
  showDebug,
  onToggleDebug,
  debugSections = []
}: EmailPreviewPaneProps) {
  return (
    <div className="sticky top-4 self-start space-y-2">
      <h3 className="text-lg font-semibold">Preview</h3>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted">Subject</p>
          <p className="font-semibold">{subject}</p>
        </div>
        <div className="max-h-[calc(90vh-260px)] overflow-auto p-4">
          <iframe title="Template preview" srcDoc={html} className="w-full min-h-[380px] border-0" />
          <div className="mt-4">
            <button
              type="button"
              className="text-xs font-semibold text-brand hover:underline"
              onClick={onToggleDebug}
            >
              {showDebug ? 'Hide debug' : 'Show debug'}
            </button>
            {showDebug && debugSections.length > 0 && (
              <div className="mt-3 space-y-3 text-xs text-muted">
                {debugSections.map((section) => (
                  <div key={section.label}>
                    <p className="font-semibold text-brand">{section.label}</p>
                    <pre className="whitespace-pre-wrap">{section.content}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">Preview uses sample guest data to render variables.</p>
    </div>
  );
}
