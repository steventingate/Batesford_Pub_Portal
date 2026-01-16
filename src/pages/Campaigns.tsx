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

const seedTemplates = [
  {
    name: 'Trivia Night Promo (Thu)',
    type: 'event',
    subject: 'Trivia Night Thursday at Batesford — book a table',
    body_html:
      '<p>Hey {{first_name}},</p><p>Trivia Night is back this Thursday at Batesford Pub. Grab your team, lock in a table, and test your knowledge.</p><p><strong>Kick-off:</strong> Thursday night<br /><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Book your table</a></p><p>See you at the bar!</p>',
    body_text:
      'Hey {{first_name}},\n\nTrivia Night is back this Thursday at Batesford Pub. Grab your team, lock in a table, and test your knowledge.\n\nKick-off: Thursday night\nWhere: {{venue_address}}\n\nBook your table: {{booking_link}}\n\nSee you at the bar!'
  },
  {
    name: 'Live Music Weekend',
    type: 'event',
    subject: 'Live music this weekend — reserve your spot',
    body_html:
      '<p>Hi {{first_name}},</p><p>We’ve got live music lined up this weekend at Batesford Pub. Good tunes, great food, and your favourite locals.</p><p><strong>When:</strong> Friday &amp; Saturday<br /><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Reserve a table</a></p><p>Bring a mate.</p>',
    body_text:
      'Hi {{first_name}},\n\nWe’ve got live music lined up this weekend at Batesford Pub. Good tunes, great food, and your favourite locals.\n\nWhen: Friday & Saturday\nWhere: {{venue_address}}\n\nReserve a table: {{booking_link}}\n\nBring a mate.'
  },
  {
    name: 'Happy Hour / Drinks Special',
    type: 'regular',
    subject: 'Happy Hour at Batesford — your first round is waiting',
    body_html:
      '<p>Hey {{first_name}},</p><p>It’s Happy Hour at Batesford Pub. Swing by for drink specials and a relaxed catch-up.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Plan your visit</a></p><p>Cheers!</p>',
    body_text:
      'Hey {{first_name}},\n\nIt’s Happy Hour at Batesford Pub. Swing by for drink specials and a relaxed catch-up.\n\nWhere: {{venue_address}}\n\nPlan your visit: {{booking_link}}\n\nCheers!'
  },
  {
    name: 'Weekly Special — Steak or Parma Night',
    type: 'regular',
    subject: 'Weekly Special Night — choose Steak or Parma',
    body_html:
      '<p>Hi {{first_name}},</p><p>Your weekly special is on. Pick steak or parma and make it a mid‑week win.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Book for special night</a></p><p>We’ll save you a seat.</p>',
    body_text:
      'Hi {{first_name}},\n\nYour weekly special is on. Pick steak or parma and make it a mid‑week win.\n\nWhere: {{venue_address}}\n\nBook for special night: {{booking_link}}\n\nWe’ll save you a seat.'
  },
  {
    name: 'Kids Eat Free / Family Offer',
    type: 'regular',
    subject: 'Family night at Batesford — kids eat free',
    body_html:
      '<p>Hey {{first_name}},</p><p>Bring the family in — kids eat free on family night at Batesford Pub.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Reserve a family table</a></p><p>See you soon.</p>',
    body_text:
      'Hey {{first_name}},\n\nBring the family in — kids eat free on family night at Batesford Pub.\n\nWhere: {{venue_address}}\n\nReserve a family table: {{booking_link}}\n\nSee you soon.'
  },
  {
    name: 'Win-back — We Miss You',
    type: 'winback',
    subject: 'We haven’t seen you in a while — come say hi',
    body_html:
      '<p>Hi {{first_name}},</p><p>It’s been a little while since your last visit on {{last_visit_date}}. We’d love to welcome you back at Batesford Pub.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Plan a visit</a></p><p>See you soon!</p>',
    body_text:
      'Hi {{first_name}},\n\nIt’s been a little while since your last visit on {{last_visit_date}}. We’d love to welcome you back at Batesford Pub.\n\nWhere: {{venue_address}}\n\nPlan a visit: {{booking_link}}\n\nSee you soon!'
  },
  {
    name: 'Regulars Reward',
    type: 'custom',
    subject: 'Thanks for visiting {{visit_count}} times — a little treat',
    body_html:
      '<p>Hey {{first_name}},</p><p>You’ve visited Batesford Pub {{visit_count}} times. That means a lot to us. Drop in this week and let us shout you a little thank‑you.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Book a table</a></p><p>We’ll see you at the bar.</p>',
    body_text:
      'Hey {{first_name}},\n\nYou’ve visited Batesford Pub {{visit_count}} times. That means a lot to us. Drop in this week and let us shout you a little thank‑you.\n\nWhere: {{venue_address}}\n\nBook a table: {{booking_link}}\n\nWe’ll see you at the bar.'
  },
  {
    name: 'Welcome / Thanks for Visiting',
    type: 'regular',
    subject: 'Thanks for visiting Batesford Pub!',
    body_html:
      '<p>Hi {{first_name}},</p><p>Thanks for stopping by. We hope you enjoyed your visit on {{last_visit_date}}. If you’re keen for another round, we’d love to see you again.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Book your next visit</a></p><p>Cheers!</p>',
    body_text:
      'Hi {{first_name}},\n\nThanks for stopping by. We hope you enjoyed your visit on {{last_visit_date}}. If you’re keen for another round, we’d love to see you again.\n\nWhere: {{venue_address}}\n\nBook your next visit: {{booking_link}}\n\nCheers!'
  }
];

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

  const handleSeedTemplates = useCallback(async () => {
    const { data: existing, error } = await supabase
      .from('campaign_templates')
      .select('name');

    if (error) {
      pushToast('You do not have access to seed templates.', 'error');
      return;
    }

    const existingNames = new Set((existing ?? []).map((row) => row.name));
    const rowsToInsert = seedTemplates.filter((template) => !existingNames.has(template.name));

    if (!rowsToInsert.length) {
      pushToast('Templates already seeded.', 'info');
      return;
    }

    const { error: insertError } = await supabase
      .from('campaign_templates')
      .insert(rowsToInsert);

    if (insertError) {
      pushToast(`Seed failed: ${insertError.message}`, 'error');
      return;
    }

    pushToast('Templates seeded.', 'success');
    loadTemplates();
  }, [loadTemplates, pushToast]);

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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleSeedTemplates}>Seed templates</Button>
            <Button variant="outline" onClick={loadTemplates}>Refresh</Button>
            <Button onClick={startCreate}>Create Template</Button>
          </div>
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
