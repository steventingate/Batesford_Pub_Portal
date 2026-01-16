import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { formatDateTime } from '../lib/format';
import { useToast } from '../components/ToastProvider';

type Template = {
  id: string;
  name: string;
  type: string;
  subject: string;
  body_html: string;
  body_text: string;
  created_at: string;
};

type EditorState = {
  id: string | null;
  name: string;
  type: string;
  subject: string;
  bodyHtml: string;
};

const defaultEditorState: EditorState = {
  id: null,
  name: '',
  type: 'regular',
  subject: '',
  bodyHtml: '<p>Welcome back to Batesford Pub.</p>'
};

const variableOptions = [
  { label: 'First name', value: '{{first_name}}' },
  { label: 'Visit count', value: '{{visit_count}}' },
  { label: 'Last visit date', value: '{{last_visit_date}}' }
];

const sampleData = {
  first_name: 'Alex',
  visit_count: '3',
  last_visit_date: '12 Jan 2026'
};

const renderPreview = (html: string) => {
  return html
    .replace(/{{first_name}}/g, sampleData.first_name)
    .replace(/{{visit_count}}/g, sampleData.visit_count)
    .replace(/{{last_visit_date}}/g, sampleData.last_visit_date);
};

const stripHtml = (html: string) => {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

export default function Campaigns() {
  const { pushToast } = useToast();
  const [activeTab, setActiveTab] = useState<'templates' | 'send' | 'history'>('templates');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editor, setEditor] = useState<EditorState>(defaultEditorState);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from('campaign_templates')
      .select('id, name, type, subject, body_html, body_text, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      pushToast('You do not have access to templates.', 'error');
      return;
    }
    setTemplates((data as Template[]) ?? []);
  }, [pushToast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = editor.bodyHtml;
  }, [editor.id, editor.bodyHtml]);

  const startCreate = () => {
    setEditor(defaultEditorState);
    setEditing(true);
    setStatus('');
  };

  const startEdit = (template: Template) => {
    setEditor({
      id: template.id,
      name: template.name,
      type: template.type,
      subject: template.subject,
      bodyHtml: template.body_html
    });
    setEditing(true);
    setStatus('');
  };

  const syncEditorHtml = () => {
    const html = editorRef.current?.innerHTML ?? '';
    setEditor((prev) => ({ ...prev, bodyHtml: html }));
  };

  const handleCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    syncEditorHtml();
  };

  const handleInsertVariable = (value: string) => {
    if (!value) return;
    document.execCommand('insertText', false, value);
    syncEditorHtml();
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!editor.id) {
      setStatus('Save the template before uploading images.');
      pushToast('Save the template first.', 'error');
      event.target.value = '';
      return;
    }
    setStatus('Uploading image...');
    const fileName = `${Date.now()}-${file.name}`.replace(/\s+/g, '-');
    const path = `${editor.id}/${fileName}`;

    const { error } = await supabase.storage
      .from('campaign-images')
      .upload(path, file, { upsert: false });

    if (error) {
      setStatus(`Upload failed: ${error.message}`);
      pushToast('Image upload failed.', 'error');
      return;
    }

    const { data } = supabase.storage.from('campaign-images').getPublicUrl(path);
    const imgTag = `<img src="${data.publicUrl}" style="max-width:100%;height:auto;border-radius:12px;" />`;
    document.execCommand('insertHTML', false, imgTag);
    syncEditorHtml();
    setStatus('Image added.');
    pushToast('Image inserted.', 'success');
    event.target.value = '';
  };

  const handleSave = async () => {
    if (!editor.name.trim() || !editor.subject.trim()) {
      setStatus('Name and subject are required.');
      return;
    }
    setSaving(true);
    setStatus('');
    const payload = {
      name: editor.name.trim(),
      type: editor.type,
      subject: editor.subject.trim(),
      body_html: editor.bodyHtml,
      body_text: stripHtml(editor.bodyHtml)
    };

    if (editor.id) {
      const { error } = await supabase
        .from('campaign_templates')
        .update(payload)
        .eq('id', editor.id);
      if (error) {
        setStatus(`Save failed: ${error.message}`);
        pushToast('You do not have access to update templates.', 'error');
      } else {
        setStatus('Template updated.');
        pushToast('Template updated.', 'success');
        loadTemplates();
      }
    } else {
      const { data, error } = await supabase
        .from('campaign_templates')
        .insert(payload)
        .select('id')
        .single();
      if (error) {
        setStatus(`Save failed: ${error.message}`);
        pushToast('You do not have access to create templates.', 'error');
      } else {
        setStatus('Template created.');
        pushToast('Template created.', 'success');
        setEditor((prev) => ({ ...prev, id: data.id }));
        loadTemplates();
      }
    }
    setSaving(false);
  };

  const handleDuplicate = async (template: Template) => {
    const { error } = await supabase
      .from('campaign_templates')
      .insert({
        name: `Copy of ${template.name}`,
        type: template.type,
        subject: template.subject,
        body_html: template.body_html,
        body_text: template.body_text
      });
    if (error) {
      setStatus(`Duplicate failed: ${error.message}`);
      pushToast('You do not have access to duplicate templates.', 'error');
      return;
    }
    pushToast('Template duplicated.', 'success');
    loadTemplates();
  };

  const handleDelete = async (template: Template) => {
    const confirmed = window.confirm(`Delete "${template.name}"?`);
    if (!confirmed) return;
    const { error } = await supabase
      .from('campaign_templates')
      .delete()
      .eq('id', template.id);
    if (error) {
      setStatus(`Delete failed: ${error.message}`);
      pushToast('You do not have access to delete templates.', 'error');
      return;
    }
    if (editor.id === template.id) {
      setEditing(false);
      setEditor(defaultEditorState);
    }
    pushToast('Template deleted.', 'success');
    loadTemplates();
  };

  const previewHtml = useMemo(() => renderPreview(editor.bodyHtml), [editor.bodyHtml]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="text-3xl font-display text-brand">Campaigns</h2>
          <p className="text-muted">Fast, venue-first guest messaging.</p>
        </div>
        {activeTab === 'templates' && (
          <Button onClick={startCreate}>Create Template</Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={activeTab === 'templates' ? 'primary' : 'outline'} onClick={() => setActiveTab('templates')}>
          Templates
        </Button>
        <Button variant={activeTab === 'send' ? 'primary' : 'outline'} onClick={() => setActiveTab('send')}>
          Send
        </Button>
        <Button variant={activeTab === 'history' ? 'primary' : 'outline'} onClick={() => setActiveTab('history')}>
          History
        </Button>
      </div>

      {activeTab === 'templates' && (
        <div className="space-y-6">
          <Card>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-2">Name</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Created</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id} className="border-t border-slate-100">
                      <td className="py-3 font-semibold text-brand">{template.name}</td>
                      <td className="py-3 text-sm text-muted">{template.type}</td>
                      <td className="py-3 text-sm text-muted">{formatDateTime(template.created_at)}</td>
                      <td className="py-3 flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => startEdit(template)}>Edit</Button>
                        <Button variant="ghost" onClick={() => handleDuplicate(template)}>Duplicate</Button>
                        <Button variant="ghost" onClick={() => handleDelete(template)}>Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!templates.length && <p className="text-center text-sm text-muted py-8">No templates yet.</p>}
            </div>
          </Card>

          {editing && (
            <Card>
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input
                      label="Template name"
                      value={editor.name}
                      onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Weekend welcome"
                    />
                    <Select
                      label="Type"
                      value={editor.type}
                      onChange={(event) => setEditor((prev) => ({ ...prev, type: event.target.value }))}
                    >
                      <option value="event">Event</option>
                      <option value="winback">Winback</option>
                      <option value="regular">Regular</option>
                      <option value="custom">Custom</option>
                    </Select>
                    <Input
                      label="Subject"
                      value={editor.subject}
                      onChange={(event) => setEditor((prev) => ({ ...prev, subject: event.target.value }))}
                      placeholder="You’re invited back to Batesford"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => handleCommand('bold')}>Bold</Button>
                    <Button variant="outline" onClick={() => handleCommand('italic')}>Italic</Button>
                    <Button variant="outline" onClick={() => handleCommand('insertUnorderedList')}>Bullets</Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const url = window.prompt('Enter link URL');
                        if (url) handleCommand('createLink', url);
                      }}
                    >
                      Link
                    </Button>
                    <Select label="Insert variable" onChange={(event) => handleInsertVariable(event.target.value)} defaultValue="">
                      <option value="" disabled>Select variable</option>
                      {variableOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Select>
                    <Button variant="outline" onClick={handleUploadClick}>Upload image</Button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </div>

                  <div>
                    <span className="block text-sm font-semibold text-muted mb-2">Email body</span>
                    <div
                      ref={editorRef}
                      className="input min-h-[220px] bg-white"
                      contentEditable
                      onInput={syncEditorHtml}
                      suppressContentEditableWarning
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save template'}</Button>
                    {status && <span className="text-sm text-muted">{status}</span>}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Preview</h3>
                  <div className="rounded-xl border border-slate-200 p-4 bg-white">
                    <p className="text-xs uppercase tracking-wide text-muted mb-2">Subject</p>
                    <p className="font-semibold mb-4">{renderPreview(editor.subject)}</p>
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                  <p className="text-xs text-muted">
                    Preview uses sample guest data to render variables.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'send' && (
        <Card>
          <p className="text-sm text-muted">Send flow is next. This tab will let staff pick a template, audience, and schedule a run.</p>
        </Card>
      )}

      {activeTab === 'history' && (
        <Card>
          <p className="text-sm text-muted">History will show past campaign runs and outcomes.</p>
        </Card>
      )}
    </div>
  );
}
