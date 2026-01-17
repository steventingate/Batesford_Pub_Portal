import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { EditorToolbar } from './EditorToolbar';
import { EmailPreviewPane } from './EmailPreviewPane';

type VariableOption = {
  label: string;
  value: string;
};

type TemplateEditorFormProps = {
  name: string;
  type: string;
  subject: string;
  bodyHtml: string;
  heroImagePath: string | null;
  footerImagePath: string | null;
  saving: boolean;
  status: string;
  resolvedHeroPreview: string;
  resolvedFooterPreview: string;
  previewSubject: string;
  previewHtml: string;
  showPreviewDebug: boolean;
  debugSections: { label: string; content: string }[];
  variableOptions: VariableOption[];
  editorRef: React.RefObject<HTMLDivElement>;
  heroInputRef: React.RefObject<HTMLInputElement>;
  footerInputRef: React.RefObject<HTMLInputElement>;
  inlineInputRef: React.RefObject<HTMLInputElement>;
  canUploadAssets: boolean;
  onNameChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onBodyInput: () => void;
  onCommand: (command: string, value?: string) => void;
  onInsertVariable: (token: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onTogglePreviewDebug: () => void;
  onHeroUploadClick: () => void;
  onFooterUploadClick: () => void;
  onInlineUploadClick: () => void;
  onRemoveHero: () => void;
  onRemoveFooter: () => void;
  onHeroUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFooterUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onInlineUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export function TemplateEditorForm({
  name,
  type,
  subject,
  bodyHtml,
  heroImagePath,
  footerImagePath,
  saving,
  status,
  resolvedHeroPreview,
  resolvedFooterPreview,
  previewSubject,
  previewHtml,
  showPreviewDebug,
  debugSections,
  variableOptions,
  editorRef,
  heroInputRef,
  footerInputRef,
  inlineInputRef,
  canUploadAssets,
  onNameChange,
  onTypeChange,
  onSubjectChange,
  onBodyInput,
  onCommand,
  onInsertVariable,
  onSave,
  onCancel,
  onTogglePreviewDebug,
  onHeroUploadClick,
  onFooterUploadClick,
  onInlineUploadClick,
  onRemoveHero,
  onRemoveFooter,
  onHeroUpload,
  onFooterUpload,
  onInlineUpload
}: TemplateEditorFormProps) {
  const headerTitle = name.trim() ? `Edit ${name.trim()}` : 'Edit Template';
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Template editor</p>
          <h3 className="text-xl font-semibold text-brand">{headerTitle}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving} type="button">
            {saving ? 'Saving...' : 'Save template'}
          </Button>
          {status && <span className="text-sm text-muted">{status}</span>}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="grid grid-cols-1 gap-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.2fr_0.6fr_1.4fr]">
            <Input
              label="Template name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Weekend welcome"
              data-autofocus="true"
            />
            <Select
              label="Type"
              value={type}
              onChange={(event) => onTypeChange(event.target.value)}
            >
              <option value="event">Event</option>
              <option value="winback">Winback</option>
              <option value="regular">Regular</option>
              <option value="custom">Custom</option>
            </Select>
            <Input
              label="Subject"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              placeholder="You are invited back to Batesford"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              <EditorToolbar
                onCommand={onCommand}
                onInsertVariable={onInsertVariable}
                onInsertInlineImage={onInlineUploadClick}
                onSetHeroImage={onHeroUploadClick}
                onSetFooterImage={onFooterUploadClick}
                variableOptions={variableOptions}
                canUploadAssets={canUploadAssets}
              />

              <div>
                <span className="block text-sm font-semibold text-muted mb-2">Email body</span>
                <div
                  ref={editorRef}
                  className="input min-h-[260px] h-auto bg-white"
                  contentEditable
                  role="textbox"
                  aria-label="Email body"
                  onInput={onBodyInput}
                  suppressContentEditableWarning
                  data-editor-value={bodyHtml}
                />
              </div>

              <details className="rounded-xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer text-sm font-semibold text-brand">Images</summary>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-slate-100 p-3">
                    <div>
                      <p className="text-sm font-semibold text-brand">Hero image</p>
                      <p className="text-xs text-muted">Shows at the top of the email.</p>
                    </div>
                    {resolvedHeroPreview ? (
                      <img src={resolvedHeroPreview} alt="Hero preview" className="max-h-32 w-full rounded-lg object-cover" />
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-muted text-center">
                        No hero image yet.
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={onHeroUploadClick}
                        disabled={!canUploadAssets}
                        type="button"
                      >
                        {heroImagePath ? 'Replace hero' : 'Upload hero'}
                      </Button>
                      {heroImagePath && (
                        <Button variant="ghost" onClick={onRemoveHero} type="button">
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {heroImagePath ? 'Template override in use.' : 'Falling back to branding default.'}
                    </p>
                  </div>

                  <div className="space-y-3 rounded-lg border border-slate-100 p-3">
                    <div>
                      <p className="text-sm font-semibold text-brand">Footer banner</p>
                      <p className="text-xs text-muted">Optional banner before the footer text.</p>
                    </div>
                    {resolvedFooterPreview ? (
                      <img
                        src={resolvedFooterPreview}
                        alt="Footer preview"
                        className="max-h-32 w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-muted text-center">
                        No footer banner yet.
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={onFooterUploadClick}
                        disabled={!canUploadAssets}
                        type="button"
                      >
                        {footerImagePath ? 'Replace footer' : 'Upload footer'}
                      </Button>
                      {footerImagePath && (
                        <Button variant="ghost" onClick={onRemoveFooter} type="button">
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {footerImagePath ? 'Template override in use.' : 'Falling back to branding default.'}
                    </p>
                  </div>
                </div>
              </details>

              <input ref={heroInputRef} type="file" accept="image/*" className="hidden" onChange={onHeroUpload} />
              <input ref={footerInputRef} type="file" accept="image/*" className="hidden" onChange={onFooterUpload} />
              <input ref={inlineInputRef} type="file" accept="image/*" className="hidden" onChange={onInlineUpload} />
            </div>

            <EmailPreviewPane
              subject={previewSubject}
              html={previewHtml}
              showDebug={showPreviewDebug}
              onToggleDebug={onTogglePreviewDebug}
              debugSections={debugSections}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
