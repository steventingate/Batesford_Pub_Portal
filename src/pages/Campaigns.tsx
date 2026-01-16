import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { formatDateTime } from '../lib/format';
import { renderEmailHtml, stripInlineImageTokens, type InlineImage } from '../lib/emailRenderer';
import { resolveStorageUrl } from '../lib/storage';
import { useToast } from '../components/ToastProvider';

type Template = {
  id: string;
  name: string;
  type: string;
  subject: string;
  body_html: string;
  body_text: string;
  hero_image_path?: string | null;
  footer_image_path?: string | null;
  inline_images?: InlineImage[] | null;
  created_at: string;
};

type BrandAsset = {
  id: string;
  key: string;
  label: string;
  url: string;
};

type EditorState = {
  id: string | null;
  name: string;
  type: string;
  subject: string;
  bodyHtml: string;
  heroImagePath: string | null;
  footerImagePath: string | null;
  inlineImages: InlineImage[];
};

type Recipient = {
  guest_id: string;
  email: string | null;
  full_name: string | null;
  visit_count: number | null;
  last_seen_at: string | null;
  visits_by_weekday?: Record<string, number> | null;
  segment?: string | null;
};

type GuestOption = {
  guest_id: string;
  email: string | null;
  full_name: string | null;
  visit_count: number | null;
  last_seen_at: string | null;
};

type AudienceFilters = {
  rangeDays: number;
  returningOnly: boolean;
  regularsOnly: boolean;
  hasEmail: boolean;
  weekday: string;
  region: string;
};

type CampaignRunRow = {
  id: string;
  status: string;
  sent_at: string | null;
  scheduled_for: string | null;
  recipient_count: number;
  campaigns: { name: string }[] | { name: string } | null;
};

const defaultEditorState: EditorState = {
  id: null,
  name: '',
  type: 'regular',
  subject: '',
  bodyHtml: '<p>Welcome back to Batesford Pub.</p>',
  heroImagePath: null,
  footerImagePath: null,
  inlineImages: []
};

const variableOptions = [
  { label: 'First name', value: '{{first_name}}' },
  { label: 'Visit count', value: '{{visit_count}}' },
  { label: 'Last visit date', value: '{{last_visit_date}}' }
];

const seedTemplates = [
  {
    name: 'Trivia Night Promo (Thu)',
    type: 'event',
    subject: 'Trivia Night Thursday at Batesford - book a table',
    body_html:
      '<p>Hey {{first_name}},</p><p>Trivia Night is back this Thursday at Batesford Pub. Grab your team, lock in a table, and test your knowledge.</p><p><strong>Kick-off:</strong> Thursday night<br /><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Book your table</a></p><p>See you at the bar!</p>',
    body_text:
      'Hey {{first_name}},\n\nTrivia Night is back this Thursday at Batesford Pub. Grab your team, lock in a table, and test your knowledge.\n\nKick-off: Thursday night\nWhere: {{venue_address}}\n\nBook your table: {{booking_link}}\n\nSee you at the bar!'
  },
  {
    name: 'Live Music Weekend',
    type: 'event',
    subject: 'Live music this weekend - reserve your spot',
    body_html:
      '<p>Hi {{first_name}},</p><p>We have live music lined up this weekend at Batesford Pub. Good tunes, great food, and your favourite locals.</p><p><strong>When:</strong> Friday &amp; Saturday<br /><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Reserve a table</a></p><p>Bring a mate.</p>',
    body_text:
      'Hi {{first_name}},\n\nWe have live music lined up this weekend at Batesford Pub. Good tunes, great food, and your favourite locals.\n\nWhen: Friday & Saturday\nWhere: {{venue_address}}\n\nReserve a table: {{booking_link}}\n\nBring a mate.'
  },
  {
    name: 'Happy Hour / Drinks Special',
    type: 'regular',
    subject: 'Happy Hour at Batesford - your first round is waiting',
    body_html:
      '<p>Hey {{first_name}},</p><p>It is Happy Hour at Batesford Pub. Swing by for drink specials and a relaxed catch-up.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Plan your visit</a></p><p>Cheers!</p>',
    body_text:
      'Hey {{first_name}},\n\nIt is Happy Hour at Batesford Pub. Swing by for drink specials and a relaxed catch-up.\n\nWhere: {{venue_address}}\n\nPlan your visit: {{booking_link}}\n\nCheers!'
  },
  {
    name: 'Weekly Special - Steak or Parma Night',
    type: 'regular',
    subject: 'Weekly Special Night - choose Steak or Parma',
    body_html:
      '<p>Hi {{first_name}},</p><p>Your weekly special is on. Pick steak or parma and make it a mid-week win.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Book for special night</a></p><p>We will save you a seat.</p>',
    body_text:
      'Hi {{first_name}},\n\nYour weekly special is on. Pick steak or parma and make it a mid-week win.\n\nWhere: {{venue_address}}\n\nBook for special night: {{booking_link}}\n\nWe will save you a seat.'
  },
  {
    name: 'Kids Eat Free / Family Offer',
    type: 'regular',
    subject: 'Family night at Batesford - kids eat free',
    body_html:
      '<p>Hey {{first_name}},</p><p>Bring the family in - kids eat free on family night at Batesford Pub.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Reserve a family table</a></p><p>See you soon.</p>',
    body_text:
      'Hey {{first_name}},\n\nBring the family in - kids eat free on family night at Batesford Pub.\n\nWhere: {{venue_address}}\n\nReserve a family table: {{booking_link}}\n\nSee you soon.'
  },
  {
    name: 'Win-back - We Miss You',
    type: 'winback',
    subject: 'We have not seen you in a while - come say hi',
    body_html:
      '<p>Hi {{first_name}},</p><p>It has been a little while since your last visit on {{last_visit_date}}. We would love to welcome you back at Batesford Pub.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Plan a visit</a></p><p>See you soon!</p>',
    body_text:
      'Hi {{first_name}},\n\nIt has been a little while since your last visit on {{last_visit_date}}. We would love to welcome you back at Batesford Pub.\n\nWhere: {{venue_address}}\n\nPlan a visit: {{booking_link}}\n\nSee you soon!'
  },
  {
    name: 'Regulars Reward',
    type: 'custom',
    subject: 'Thanks for visiting {{visit_count}} times - a little treat',
    body_html:
      '<p>Hey {{first_name}},</p><p>You have visited Batesford Pub {{visit_count}} times. That means a lot to us. Drop in this week and let us shout you a little thank-you.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Book a table</a></p><p>We will see you at the bar.</p>',
    body_text:
      'Hey {{first_name}},\n\nYou have visited Batesford Pub {{visit_count}} times. That means a lot to us. Drop in this week and let us shout you a little thank-you.\n\nWhere: {{venue_address}}\n\nBook a table: {{booking_link}}\n\nWe will see you at the bar.'
  },
  {
    name: 'Welcome / Thanks for Visiting',
    type: 'regular',
    subject: 'Thanks for visiting Batesford Pub!',
    body_html:
      '<p>Hi {{first_name}},</p><p>Thanks for stopping by. We hope you enjoyed your visit on {{last_visit_date}}. If you are keen for another round, we would love to see you again.</p><p><strong>Where:</strong> {{venue_address}}</p><p><a href="{{booking_link}}">Book your next visit</a></p><p>Cheers!</p>',
    body_text:
      'Hi {{first_name}},\n\nThanks for stopping by. We hope you enjoyed your visit on {{last_visit_date}}. If you are keen for another round, we would love to see you again.\n\nWhere: {{venue_address}}\n\nBook your next visit: {{booking_link}}\n\nCheers!'
  }
];

const sampleData = {
  first_name: 'Sam',
  visit_count: '3',
  last_visit_date: '15 Jan 2026'
};

const stripHtml = (html: string) => {
  return stripInlineImageTokens(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const getFirstName = (fullName: string | null) => {
  if (!fullName) return 'there';
  return fullName.split(' ')[0] || 'there';
};

const toLocalDate = (iso: string | null) => {
  if (!iso) return sampleData.last_visit_date;
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
};

const renderText = (text: string, tokens: Record<string, string>) => {
  let output = stripInlineImageTokens(text);
  Object.entries(tokens).forEach(([key, value]) => {
    output = output.split(`{{${key}}}`).join(value);
  });
  return output;
};

export default function Campaigns() {
  const { pushToast } = useToast();
  const [activeTab, setActiveTab] = useState<'templates' | 'send' | 'history'>('templates');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editor, setEditor] = useState<EditorState>(defaultEditorState);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [viewerTemplate, setViewerTemplate] = useState<Template | null>(null);
  const [viewerMode, setViewerMode] = useState<'html' | 'text'>('html');
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendQuery, setSendQuery] = useState('');
  const [sendOptions, setSendOptions] = useState<GuestOption[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<GuestOption | null>(null);
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingSingle, setSendingSingle] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [filters, setFilters] = useState<AudienceFilters>({
    rangeDays: 30,
    returningOnly: false,
    regularsOnly: false,
    hasEmail: true,
    weekday: '',
    region: 'any'
  });
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [sendResult, setSendResult] = useState<{ status: 'sent' | 'scheduled'; count: number } | null>(null);
  const [sendingWizardTest, setSendingWizardTest] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const heroInputRef = useRef<HTMLInputElement | null>(null);
  const footerInputRef = useRef<HTMLInputElement | null>(null);
  const inlineInputRef = useRef<HTMLInputElement | null>(null);
  const [brandAssets, setBrandAssets] = useState<Record<string, BrandAsset | null>>({});

  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from('campaign_templates')
      .select('id, name, type, subject, body_html, body_text, hero_image_path, footer_image_path, inline_images, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      pushToast('You do not have access to templates.', 'error');
      return;
    }
    setTemplates((data as Template[]) ?? []);
  }, [pushToast]);

  const loadBrandAssets = useCallback(async () => {
    const { data, error } = await supabase
      .from('brand_assets')
      .select('id, key, label, url');
    if (error) {
      pushToast('Unable to load brand assets.', 'error');
      return;
    }
    const map: Record<string, BrandAsset | null> = {};
    (data ?? []).forEach((row) => {
      map[row.key] = row as BrandAsset;
    });
    setBrandAssets(map);
  }, [pushToast]);

  const loadRecipients = useCallback(async () => {
    setLoadingRecipients(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filters.rangeDays);
    const minVisits = filters.regularsOnly ? 5 : filters.returningOnly ? 2 : 0;

    let query = supabase
      .from('guest_segments')
      .select('guest_id, email, full_name, visit_count, last_seen_at, visits_by_weekday, segment')
      .gte('last_seen_at', cutoff.toISOString())
      .order('last_seen_at', { ascending: false })
      .limit(5000);

    if (filters.hasEmail) {
      query = query.not('email', 'is', null).neq('email', '');
    }
    if (minVisits > 0) {
      query = query.gte('visit_count', minVisits);
    }
    if (filters.region && filters.region !== 'any') {
      query = query.eq('segment', filters.region);
    }

    const { data, error } = await query;
    if (error) {
      pushToast('Unable to load audience. Check permissions.', 'error');
      setRecipients([]);
      setLoadingRecipients(false);
      return;
    }

    let filtered = (data as Recipient[]) ?? [];
    if (filters.weekday) {
      filtered = filtered.filter((recipient) => {
        const count = recipient.visits_by_weekday?.[filters.weekday];
        return count && Number(count) > 0;
      });
    }
    setRecipients(filtered);
    setLoadingRecipients(false);
  }, [filters, pushToast]);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('campaign_runs')
      .select('id, status, sent_at, scheduled_for, recipient_count, campaigns(name)')
      .order('sent_at', { ascending: false })
      .order('scheduled_for', { ascending: false })
      .limit(50);

    if (error) {
      pushToast('Unable to load campaign history.', 'error');
      return [];
    }
    return (data as CampaignRunRow[]) ?? [];
  }, [pushToast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadBrandAssets();
    const channel = supabase
      .channel('brand-assets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brand_assets' },
        () => loadBrandAssets()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadBrandAssets]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = editor.bodyHtml;
  }, [editor.id, editor.bodyHtml]);

  useEffect(() => {
    if (activeTab !== 'send') return;
    loadRecipients();
  }, [activeTab, loadRecipients]);

  useEffect(() => {
    if (!sendModalOpen) return;
    if (!sendQuery.trim()) {
      setSendOptions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const query = sendQuery.trim();
      const { data, error } = await supabase
        .from('guest_segments')
        .select('guest_id, email, full_name, visit_count, last_seen_at, segment')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);
      if (error) {
        pushToast('Unable to search guests.', 'error');
        return;
      }
      setSendOptions((data as GuestOption[]) ?? []);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [sendModalOpen, sendQuery, pushToast]);

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
      bodyHtml: template.body_html,
      heroImagePath: template.hero_image_path ?? null,
      footerImagePath: template.footer_image_path ?? null,
      inlineImages: template.inline_images ?? []
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

  const ensureTemplateReady = (target?: HTMLInputElement) => {
    if (editor.id) return true;
    setStatus('Save the template before uploading images.');
    pushToast('Save the template first.', 'error');
    if (target) target.value = '';
    return false;
  };

  const sanitizeFileName = (fileName: string) => {
    return fileName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
  };

  const getUploadId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const insertBodyToken = (token: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
      const inserted = document.execCommand('insertText', false, token);
      if (inserted) {
        syncEditorHtml();
        return;
      }
    }
    setEditor((prev) => ({ ...prev, bodyHtml: `${prev.bodyHtml}${token}` }));
  };

  const uploadTemplateAsset = async (file: File, folder: string) => {
    if (!editor.id) return '';
    const cleanName = sanitizeFileName(file.name);
    const path = `templates/${editor.id}/${folder}/${getUploadId()}-${cleanName}`;
    const { error } = await supabase.storage
      .from('campaign-assets')
      .upload(path, file, { upsert: false });
    if (error) {
      setStatus(`Upload failed: ${error.message}`);
      pushToast('Image upload failed.', 'error');
      return '';
    }
    return path;
  };

  const handleHeroUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !ensureTemplateReady(event.target)) return;
    setStatus('Uploading hero image...');
    const path = await uploadTemplateAsset(file, 'hero');
    if (!path) return;
    const { error } = await supabase
      .from('campaign_templates')
      .update({ hero_image_path: path })
      .eq('id', editor.id);
    if (error) {
      setStatus(`Hero update failed: ${error.message}`);
      pushToast('Unable to save hero image.', 'error');
      return;
    }
    setEditor((prev) => ({ ...prev, heroImagePath: path }));
    setStatus('Hero image updated.');
    pushToast('Hero image updated.', 'success');
    loadTemplates();
    event.target.value = '';
  };

  const handleFooterUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !ensureTemplateReady(event.target)) return;
    setStatus('Uploading footer banner...');
    const path = await uploadTemplateAsset(file, 'footer');
    if (!path) return;
    const { error } = await supabase
      .from('campaign_templates')
      .update({ footer_image_path: path })
      .eq('id', editor.id);
    if (error) {
      setStatus(`Footer update failed: ${error.message}`);
      pushToast('Unable to save footer banner.', 'error');
      return;
    }
    setEditor((prev) => ({ ...prev, footerImagePath: path }));
    setStatus('Footer banner updated.');
    pushToast('Footer banner updated.', 'success');
    loadTemplates();
    event.target.value = '';
  };

  const handleInlineImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !ensureTemplateReady(event.target)) return;
    setStatus('Uploading inline image...');
    const path = await uploadTemplateAsset(file, 'inline');
    if (!path) return;
    const altText = window.prompt('Alt text (optional)')?.trim() || '';
    const newInline = { path, alt: altText || undefined, sort: editor.inlineImages.length };
    const nextInline = [...editor.inlineImages, newInline];

    const { error } = await supabase
      .from('campaign_templates')
      .update({ inline_images: nextInline })
      .eq('id', editor.id);
    if (error) {
      setStatus(`Inline image update failed: ${error.message}`);
      pushToast('Unable to save inline image.', 'error');
      return;
    }

    const token = altText
      ? `[[image:path="${path}" alt="${altText}"]]`
      : `[[image:path="${path}"]]`;
    insertBodyToken(token);
    setEditor((prev) => ({ ...prev, inlineImages: nextInline }));
    setStatus('Inline image inserted.');
    pushToast('Inline image inserted.', 'success');
    loadTemplates();
    event.target.value = '';
  };

  const removeHeroImage = async () => {
    if (!editor.id) return;
    const { error } = await supabase
      .from('campaign_templates')
      .update({ hero_image_path: null })
      .eq('id', editor.id);
    if (error) {
      setStatus(`Hero removal failed: ${error.message}`);
      pushToast('Unable to remove hero image.', 'error');
      return;
    }
    setEditor((prev) => ({ ...prev, heroImagePath: null }));
    setStatus('Hero image removed.');
    loadTemplates();
  };

  const removeFooterImage = async () => {
    if (!editor.id) return;
    const { error } = await supabase
      .from('campaign_templates')
      .update({ footer_image_path: null })
      .eq('id', editor.id);
    if (error) {
      setStatus(`Footer removal failed: ${error.message}`);
      pushToast('Unable to remove footer banner.', 'error');
      return;
    }
    setEditor((prev) => ({ ...prev, footerImagePath: null }));
    setStatus('Footer banner removed.');
    loadTemplates();
  };

  const handleSave = async () => {
    if (!editor.name.trim() || !editor.subject.trim()) {
      setStatus('Name and subject are required.');
      return;
    }
    setSaving(true);
    setStatus('');
    const bodyHtml = editorRef.current?.innerHTML ?? editor.bodyHtml;
    const payload = {
      name: editor.name.trim(),
      type: editor.type,
      subject: editor.subject.trim(),
      body_html: bodyHtml,
      body_text: stripHtml(bodyHtml),
      hero_image_path: editor.heroImagePath,
      footer_image_path: editor.footerImagePath,
      inline_images: editor.inlineImages
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
        body_text: template.body_text,
        hero_image_path: template.hero_image_path ?? null,
        footer_image_path: template.footer_image_path ?? null,
        inline_images: template.inline_images ?? []
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

  const handleSeedTemplates = useCallback(async () => {
    const { data: existing, error } = await supabase
      .from('campaign_templates')
      .select('id, name');

    if (error) {
      pushToast('You do not have access to seed templates.', 'error');
      return;
    }

    const existingMap = new Map((existing ?? []).map((row) => [row.name, row.id]));
    for (const template of seedTemplates) {
      const payload = {
        ...template,
        hero_image_path: null,
        footer_image_path: null,
        inline_images: []
      };
      const existingId = existingMap.get(template.name);
      if (existingId) {
        const { error: updateError } = await supabase
          .from('campaign_templates')
          .update(payload)
          .eq('id', existingId);
        if (updateError) {
          pushToast(`Seed update failed: ${updateError.message}`, 'error');
          return;
        }
      } else {
        const { error: insertError } = await supabase
          .from('campaign_templates')
          .insert(payload);
        if (insertError) {
          pushToast(`Seed failed: ${insertError.message}`, 'error');
          return;
        }
      }
    }

    pushToast('Templates seeded.', 'success');
    loadTemplates();
  }, [loadTemplates, pushToast]);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;
  const sampleRecipient = recipients[0];
  const branding = {
    logo_path: brandAssets.logo?.url ?? null,
    default_hero_path: brandAssets.hero_default?.url ?? null,
    footer_banner_path: brandAssets.footer_banner?.url ?? null
  };
  const baseVariables = {
    website_link: 'https://www.thebatesfordhotel.com.au/',
    venue_address: '700 Ballarat Road, Batesford VIC 3213',
    booking_link: 'https://www.thebatesfordhotel.com.au/'
  };
  const previewData = {
    first_name: sampleRecipient ? getFirstName(sampleRecipient.full_name) : sampleData.first_name,
    visit_count: sampleRecipient?.visit_count ? String(sampleRecipient.visit_count) : sampleData.visit_count,
    last_visit_date: toLocalDate(sampleRecipient?.last_seen_at ?? null)
  };
  const previewVariables = { ...baseVariables, ...previewData };
  const previewRender = selectedTemplate
    ? renderEmailHtml({ template: selectedTemplate, branding, variables: previewVariables })
    : null;
  const previewHtml = previewRender?.html ?? '';
  const previewSubject = previewRender?.subject ?? '';
  const brandTokenUrls = {
    brand_logo_url: resolveStorageUrl(branding.logo_path ?? ''),
    hero_image_url: resolveStorageUrl(selectedTemplate?.hero_image_path ?? branding.default_hero_path ?? ''),
    footer_banner_url: resolveStorageUrl(selectedTemplate?.footer_image_path ?? branding.footer_banner_path ?? '')
  };
  const previewText = selectedTemplate
    ? renderText(selectedTemplate.body_text, { ...previewVariables, ...brandTokenUrls })
    : '';
  const editorBodyHtml = editorRef.current?.innerHTML ?? editor.bodyHtml;
  const editorTemplatePayload = {
    subject: editor.subject,
    body_html: editorBodyHtml,
    hero_image_path: editor.heroImagePath,
    footer_image_path: editor.footerImagePath,
    inline_images: editor.inlineImages
  };
  const editorRender = renderEmailHtml({
    template: editorTemplatePayload,
    branding,
    variables: { ...baseVariables, ...sampleData }
  });
  const resolvedHeroPreview = resolveStorageUrl(editor.heroImagePath ?? branding.default_hero_path ?? '');
  const resolvedFooterPreview = resolveStorageUrl(editor.footerImagePath ?? branding.footer_banner_path ?? '');

  const sendCampaignEmail = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('send-campaign-email', {
      body: payload
    });
    if (error) {
      throw error;
    }
    return data as { success: boolean; to?: string; mode?: string; simulated?: boolean };
  };

  const resetSendModal = () => {
    setSendModalOpen(false);
    setSendQuery('');
    setSendOptions([]);
    setSelectedGuest(null);
    setManualEmail('');
    setManualName('');
  };

  const handleSendTest = async () => {
    if (!viewerTemplate) return;
    setSendingTest(true);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.email) {
      pushToast('Unable to read your admin email.', 'error');
      setSendingTest(false);
      return;
    }
    try {
      await sendCampaignEmail({
        template_id: viewerTemplate.id,
        mode: 'test',
        to_email: data.user.email
      });
      pushToast(`Test sent to ${data.user.email}`, 'success');
    } catch (err) {
      pushToast(`Test send failed: ${(err as Error).message}`, 'error');
    } finally {
      setSendingTest(false);
    }
  };

  const handleSendSingle = async () => {
    if (!viewerTemplate) return;
    const email = manualEmail.trim() || selectedGuest?.email || '';
    const name = manualName.trim() || selectedGuest?.full_name || '';
    if (!email) {
      pushToast('Add an email or select a guest.', 'error');
      return;
    }
    const guestId = manualEmail.trim() ? null : selectedGuest?.guest_id ?? null;
    setSendingSingle(true);
    try {
      await sendCampaignEmail({
        template_id: viewerTemplate.id,
        mode: 'single',
        guest_id: guestId,
        to_email: manualEmail.trim() || undefined,
        to_name: name || undefined
      });
      pushToast(`Sent to ${email}`, 'success');
      resetSendModal();
    } catch (err) {
      pushToast(`Send failed: ${(err as Error).message}`, 'error');
    } finally {
      setSendingSingle(false);
    }
  };

  const handleWizardTestSend = async () => {
    if (!selectedTemplate) return;
    setSendingWizardTest(true);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.email) {
      pushToast('Unable to read your admin email.', 'error');
      setSendingWizardTest(false);
      return;
    }
    try {
      await sendCampaignEmail({
        template_id: selectedTemplate.id,
        mode: 'test',
        to_email: data.user.email
      });
      pushToast(`Test sent to ${data.user.email}`, 'success');
    } catch (err) {
      pushToast(`Test send failed: ${(err as Error).message}`, 'error');
    } finally {
      setSendingWizardTest(false);
    }
  };

  const handleSend = async () => {
    if (!selectedTemplate) return;
    if (!recipients.length) {
      pushToast('No recipients match this audience.', 'error');
      return;
    }

    const campaignName = `${selectedTemplate.name} - ${new Date().toLocaleDateString('en-AU')}`;
    const resolvedHeroPath = selectedTemplate.hero_image_path ?? branding.default_hero_path ?? null;
    const resolvedFooterPath = selectedTemplate.footer_image_path ?? branding.footer_banner_path ?? null;
    const inlineImages = selectedTemplate.inline_images ?? [];
    const { data: campaignData, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name: campaignName,
        template_id: selectedTemplate.id,
        channel: 'email',
        hero_image_path: resolvedHeroPath,
        footer_image_path: resolvedFooterPath,
        inline_images: inlineImages
      })
      .select('id')
      .single();

    if (campaignError || !campaignData) {
      pushToast('Unable to create campaign.', 'error');
      return;
    }

    const now = new Date().toISOString();
    const scheduledFor = sendMode === 'schedule' ? new Date(scheduleAt).toISOString() : null;
    const statusValue = sendMode === 'schedule' ? 'scheduled' : 'sent';
    const sentAt = sendMode === 'schedule' ? null : now;

    const { data: runData, error: runError } = await supabase
      .from('campaign_runs')
      .insert({
        campaign_id: campaignData.id,
        sent_at: sentAt,
        scheduled_for: scheduledFor,
        recipient_count: recipients.length,
        status: statusValue
      })
      .select('id')
      .single();

    if (runError || !runData) {
      pushToast('Unable to create campaign run.', 'error');
      return;
    }

    const chunkSize = 500;
    for (let i = 0; i < recipients.length; i += chunkSize) {
      const chunk = recipients.slice(i, i + chunkSize);
      const rows = chunk.map((recipient) => ({
        campaign_run_id: runData.id,
        guest_id: recipient.guest_id,
        email: recipient.email ?? '',
        sent_at: sentAt
      }));

      const { error: recipientError } = await supabase
        .from('campaign_recipients')
        .insert(rows);

      if (recipientError) {
        pushToast('Some recipients failed to queue.', 'error');
        break;
      }
    }

    setSendResult({ status: statusValue === 'sent' ? 'sent' : 'scheduled', count: recipients.length });
    setWizardStep(4);
  };

  const [historyRows, setHistoryRows] = useState<CampaignRunRow[]>([]);

  useEffect(() => {
    if (activeTab !== 'history') return;
    loadHistory().then(setHistoryRows);
  }, [activeTab, loadHistory]);

  const renderTemplateViewer = () => {
    if (!viewerTemplate) return null;
    const viewerVariables = { ...baseVariables, ...sampleData };
    const viewerRender = renderEmailHtml({ template: viewerTemplate, branding, variables: viewerVariables });
    const viewerBrandTokens = {
      brand_logo_url: resolveStorageUrl(branding.logo_path ?? ''),
      hero_image_url: resolveStorageUrl(viewerTemplate.hero_image_path ?? branding.default_hero_path ?? ''),
      footer_banner_url: resolveStorageUrl(viewerTemplate.footer_image_path ?? branding.footer_banner_path ?? '')
    };
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <Card className="max-w-3xl w-full">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-2xl font-display text-brand">{viewerTemplate.name}</h3>
              <p className="text-sm text-muted">Type: {viewerTemplate.type}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setViewerTemplate(null);
                resetSendModal();
              }}
            >
              Close
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Button variant={viewerMode === 'html' ? 'primary' : 'outline'} onClick={() => setViewerMode('html')}>
              HTML
            </Button>
            <Button variant={viewerMode === 'text' ? 'primary' : 'outline'} onClick={() => setViewerMode('text')}>
              Plain text
            </Button>
            <Button variant="outline" onClick={() => startEdit(viewerTemplate)}>Edit</Button>
            <Button variant="ghost" onClick={() => handleDuplicate(viewerTemplate)}>Duplicate</Button>
            <Button variant="outline" onClick={handleSendTest} disabled={sendingTest}>
              {sendingTest ? 'Sending test...' : 'Send test to me'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSendQuery('');
                setSendOptions([]);
                setSelectedGuest(null);
                setManualEmail('');
                setManualName('');
                setSendModalOpen(true);
              }}
            >
              Send to individual...
            </Button>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 bg-white max-h-[70vh] overflow-y-auto">
            <p className="text-xs uppercase tracking-wide text-muted mb-2">Subject</p>
            <p className="font-semibold mb-4">
              {viewerRender.subject}
            </p>
            {viewerMode === 'html' ? (
              <iframe title="Template preview" srcDoc={viewerRender.html} className="w-full min-h-[420px] border-0" />
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-muted">
                {renderText(viewerTemplate.body_text, { ...viewerVariables, ...viewerBrandTokens })}
              </pre>
            )}
          </div>
        </Card>
        {sendModalOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <Card className="max-w-xl w-full">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-brand">Send to individual</h3>
                  <p className="text-sm text-muted">{viewerTemplate.name}</p>
                </div>
                <Button variant="outline" onClick={resetSendModal}>Close</Button>
              </div>
              <div className="space-y-4">
                <Input
                  label="Search guests"
                  value={sendQuery}
                  onChange={(event) => setSendQuery(event.target.value)}
                  placeholder="Name or email"
                />
                {!!sendOptions.length && (
                  <div className="border border-slate-200 rounded-xl divide-y">
                    {sendOptions.map((guest) => (
                      <button
                        key={guest.guest_id}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${
                          selectedGuest?.guest_id === guest.guest_id ? 'bg-slate-50' : ''
                        }`}
                        onClick={() => setSelectedGuest(guest)}
                        type="button"
                      >
                        <p className="font-semibold">{guest.full_name || 'Guest'}</p>
                        <p className="text-xs text-muted">{guest.email || 'No email'}</p>
                      </button>
                    ))}
                  </div>
                )}
                <Input
                  label="Or send to email"
                  value={manualEmail}
                  onChange={(event) => setManualEmail(event.target.value)}
                  placeholder="guest@example.com"
                />
                <Input
                  label="Recipient name (optional)"
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder="Guest name"
                />
                <div className="flex items-center gap-3">
                  <Button onClick={handleSendSingle} disabled={sendingSingle}>
                    {sendingSingle ? 'Sending...' : 'Send now'}
                  </Button>
                  <Button variant="ghost" onClick={resetSendModal}>Cancel</Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  };

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
                    <th className="py-2">Hero</th>
                    <th className="py-2">Created</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => {
                    const heroPreview = resolveStorageUrl(template.hero_image_path ?? branding.default_hero_path ?? '');
                    return (
                      <tr key={template.id} className="border-t border-slate-100">
                        <td className="py-3 font-semibold text-brand">{template.name}</td>
                        <td className="py-3 text-sm text-muted">{template.type}</td>
                        <td className="py-3">
                          {heroPreview ? (
                            <img src={heroPreview} alt="" className="h-10 w-16 rounded-md object-cover border border-slate-200" />
                          ) : (
                            <span className="text-xs text-muted">No hero</span>
                          )}
                        </td>
                        <td className="py-3 text-sm text-muted">{formatDateTime(template.created_at)}</td>
                        <td className="py-3 flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => startEdit(template)}>Edit</Button>
                          <Button variant="outline" onClick={() => setViewerTemplate(template)}>View</Button>
                          <Button variant="ghost" onClick={() => handleDuplicate(template)}>Duplicate</Button>
                          <Button variant="ghost" onClick={() => handleDelete(template)}>Delete</Button>
                        </td>
                      </tr>
                    );
                  })}
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
                      placeholder="You are invited back to Batesford"
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
                    <Button variant="outline" onClick={() => heroInputRef.current?.click()}>Set Hero Image</Button>
                    <Button variant="outline" onClick={() => inlineInputRef.current?.click()}>Insert Image into Body</Button>
                    <input ref={heroInputRef} type="file" accept="image/*" className="hidden" onChange={handleHeroUpload} />
                    <input ref={inlineInputRef} type="file" accept="image/*" className="hidden" onChange={handleInlineImageUpload} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-brand">Hero image</p>
                        <p className="text-xs text-muted">Shows at the top of the email.</p>
                      </div>
                      {resolvedHeroPreview ? (
                        <img src={resolvedHeroPreview} alt="Hero preview" className="max-h-40 w-full object-cover rounded-lg" />
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-muted text-center">
                          No hero image yet.
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => heroInputRef.current?.click()} disabled={!editor.id}>
                          {editor.heroImagePath ? 'Replace hero' : 'Upload hero'}
                        </Button>
                        {editor.heroImagePath && (
                          <Button variant="ghost" onClick={removeHeroImage}>Remove</Button>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {editor.heroImagePath ? 'Template override in use.' : 'Falling back to branding default.'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-brand">Footer banner</p>
                        <p className="text-xs text-muted">Optional banner before the footer text.</p>
                      </div>
                      {resolvedFooterPreview ? (
                        <img src={resolvedFooterPreview} alt="Footer preview" className="max-h-40 w-full object-cover rounded-lg" />
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-muted text-center">
                          No footer banner yet.
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => footerInputRef.current?.click()} disabled={!editor.id}>
                          {editor.footerImagePath ? 'Replace footer' : 'Upload footer'}
                        </Button>
                        {editor.footerImagePath && (
                          <Button variant="ghost" onClick={removeFooterImage}>Remove</Button>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {editor.footerImagePath ? 'Template override in use.' : 'Falling back to branding default.'}
                      </p>
                    </div>
                  </div>

                  <input ref={footerInputRef} type="file" accept="image/*" className="hidden" onChange={handleFooterUpload} />

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
                    <div className="rounded-xl border border-slate-200 p-4 bg-white max-w-[640px]">
                      <p className="text-xs uppercase tracking-wide text-muted mb-2">Subject</p>
                      <p className="font-semibold mb-4">
                        {editorRender.subject}
                      </p>
                      <iframe title="Template preview" srcDoc={editorRender.html} className="w-full min-h-[380px] border-0" />
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
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap gap-2 text-sm">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`px-3 py-2 rounded-full ${
                    wizardStep === step ? 'bg-brand text-white' : 'bg-brand/10 text-brand'
                  }`}
                >
                  Step {step}
                </div>
              ))}
            </div>
          </Card>

          {wizardStep === 1 && (
            <Card>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
                <div className="space-y-4">
                  <Select
                    label="Choose template"
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                  >
                    <option value="">Select a template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} - {template.type}
                      </option>
                    ))}
                  </Select>
                  {selectedTemplate && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted">Subject</p>
                      <p className="font-semibold">
                        {previewSubject}
                      </p>
                      <Button variant="outline" onClick={() => setViewerTemplate(selectedTemplate)}>
                        View template
                      </Button>
                    </div>
                  )}
                  <Button
                    onClick={() => setWizardStep(2)}
                    disabled={!selectedTemplateId}
                  >
                    Next
                  </Button>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 bg-white max-w-[640px]">
                  <p className="text-xs uppercase tracking-wide text-muted mb-2">Preview</p>
                  {selectedTemplate ? (
                    <iframe title="Template preview" srcDoc={previewHtml} className="w-full min-h-[320px] border-0" />
                  ) : (
                    <p className="text-sm text-muted">Select a template to preview.</p>
                  )}
                </div>
              </div>
            </Card>
          )}

          {wizardStep === 2 && (
            <Card>
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
                <div className="space-y-4">
                  <Select
                    label="Date range"
                    value={String(filters.rangeDays)}
                    onChange={(event) => setFilters((prev) => ({ ...prev, rangeDays: Number(event.target.value) }))}
                  >
                    <option value="7">Last 7 days</option>
                    <option value="14">Last 14 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </Select>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        checked={filters.returningOnly}
                        onChange={(event) => setFilters((prev) => ({ ...prev, returningOnly: event.target.checked }))}
                      />
                      Returning only (2+)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        checked={filters.regularsOnly}
                        onChange={(event) => setFilters((prev) => ({ ...prev, regularsOnly: event.target.checked }))}
                      />
                      Regulars (5+)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        checked={filters.hasEmail}
                        onChange={(event) => setFilters((prev) => ({ ...prev, hasEmail: event.target.checked }))}
                      />
                      Has email
                    </label>
                  </div>
                  <Select
                    label="Weekday activity"
                    value={filters.weekday}
                    onChange={(event) => setFilters((prev) => ({ ...prev, weekday: event.target.value }))}
                  >
                    <option value="">Any day</option>
                    <option value="1">Mon</option>
                    <option value="2">Tue</option>
                    <option value="3">Wed</option>
                    <option value="4">Thu</option>
                    <option value="5">Fri</option>
                    <option value="6">Sat</option>
                    <option value="0">Sun</option>
                  </Select>
                  <Select
                    label="Audience region"
                    value={filters.region}
                    onChange={(event) => setFilters((prev) => ({ ...prev, region: event.target.value }))}
                  >
                    <option value="any">Any</option>
                    <option value="local">Local</option>
                    <option value="visitor">Visitor</option>
                    <option value="unknown">Unknown</option>
                  </Select>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={loadRecipients}>Refresh audience</Button>
                    <Button onClick={() => setWizardStep(3)} disabled={!recipients.length}>
                      Next
                    </Button>
                    <Button variant="ghost" onClick={() => setWizardStep(1)}>Back</Button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 p-4 bg-white">
                    <p className="text-sm text-muted">Recipient count</p>
                    <p className="text-2xl font-semibold text-brand">
                      {loadingRecipients ? 'Loading...' : recipients.length}
                    </p>
                    {!loadingRecipients && !recipients.length && (
                      <p className="text-sm text-red-600 mt-2">No recipients match this audience.</p>
                    )}
                  </div>
                  <details className="rounded-xl border border-slate-200 p-4 bg-white">
                    <summary className="cursor-pointer text-sm font-semibold text-brand">Preview recipients</summary>
                    <div className="mt-3 space-y-2 text-sm">
                      {recipients.slice(0, 10).map((recipient) => (
                        <div key={recipient.guest_id} className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div>
                            <p className="font-semibold">{recipient.full_name || 'Guest'}</p>
                            <p className="text-xs text-muted">{recipient.email}</p>
                          </div>
                          <span className="text-xs text-muted">{recipient.last_seen_at ? formatDateTime(recipient.last_seen_at) : '-'}</span>
                        </div>
                      ))}
                      {!recipients.length && <p className="text-sm text-muted">No recipients to preview.</p>}
                    </div>
                  </details>
                </div>
              </div>
            </Card>
          )}

          {wizardStep === 3 && (
            <Card>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
                <div className="space-y-3">
                  <p className="text-sm text-muted">Subject</p>
                  <p className="text-xl font-semibold text-brand">{previewSubject}</p>
                  <div className="rounded-xl border border-slate-200 p-4 bg-white max-w-[640px]">
                    <iframe title="Template preview" srcDoc={previewHtml} className="w-full min-h-[360px] border-0" />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" onClick={() => setWizardStep(2)}>Back</Button>
                    <Button variant="outline" onClick={handleWizardTestSend} disabled={sendingWizardTest}>
                      {sendingWizardTest ? 'Sending test...' : 'Send test to me'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 p-4 bg-white">
                    <p className="text-xs uppercase tracking-wide text-muted mb-2">Plain text</p>
                    <pre className="whitespace-pre-wrap text-sm text-muted">{previewText}</pre>
                  </div>
                  <Button onClick={() => setWizardStep(4)}>Next</Button>
                </div>
              </div>
            </Card>
          )}

          {wizardStep === 4 && (
            <Card>
              {!sendResult ? (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <Button variant={sendMode === 'now' ? 'primary' : 'outline'} onClick={() => setSendMode('now')}>
                      Send now
                    </Button>
                    <Button variant={sendMode === 'schedule' ? 'primary' : 'outline'} onClick={() => setSendMode('schedule')}>
                      Schedule
                    </Button>
                  </div>
                  {sendMode === 'schedule' && (
                    <Input
                      label="Schedule for"
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(event) => setScheduleAt(event.target.value)}
                    />
                  )}
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleSend}
                      disabled={sendMode === 'schedule' && !scheduleAt}
                    >
                      Confirm
                    </Button>
                    <Button variant="ghost" onClick={() => setWizardStep(3)}>Back</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-2xl font-display text-brand">
                    {sendResult.status === 'sent' ? 'Campaign sent' : 'Campaign scheduled'}
                  </h3>
                  <p className="text-sm text-muted">
                    {sendResult.count} recipients queued.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => {
                      setActiveTab('history');
                      setWizardStep(1);
                      setSendResult(null);
                    }}>View in History</Button>
                    <Button variant="outline" onClick={() => {
                      setWizardStep(1);
                      setSendResult(null);
                    }}>Send another</Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-2">Campaign</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Sent</th>
                  <th className="py-2">Scheduled</th>
                  <th className="py-2">Recipients</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-3 font-semibold text-brand">
                      {Array.isArray(row.campaigns) ? row.campaigns[0]?.name || 'Campaign' : row.campaigns?.name || 'Campaign'}
                    </td>
                    <td className="py-3 text-sm text-muted">{row.status}</td>
                    <td className="py-3 text-sm text-muted">{row.sent_at ? formatDateTime(row.sent_at) : '-'}</td>
                    <td className="py-3 text-sm text-muted">{row.scheduled_for ? formatDateTime(row.scheduled_for) : '-'}</td>
                    <td className="py-3">{row.recipient_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!historyRows.length && <p className="text-center text-sm text-muted py-8">No campaign history yet.</p>}
          </div>
        </Card>
      )}

      {renderTemplateViewer()}
    </div>
  );
}
