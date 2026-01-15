import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { formatDateTime } from '../lib/format';
import { normalizeTags } from '../lib/segments';
import { useToast } from '../components/ToastProvider';
import { useAuth } from '../contexts/AuthContext';

type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  created_at: string;
  payload?: Record<string, unknown> | null;
};

type Tag = { id: string; tag: string; };

type Note = {
  id: string;
  note: string;
  created_at: string;
  created_by: string | null;
};

export default function ContactDetail() {
  const { id } = useParams();
  const [contact, setContact] = useState<Contact | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [visits, setVisits] = useState<Contact[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const toast = useToast();
  const { user } = useAuth();

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const { data } = await supabase
        .from('contact_submissions')
        .select('*')
        .eq('id', id)
        .single();
      if (data) {
        setContact({
          id: data.id,
          name: data.name ?? null,
          email: data.email ?? null,
          mobile: data.mobile ?? null,
          created_at: data.created_at,
          payload: data
        });
      } else {
        setContact(null);
      }

      const { data: tagData } = await supabase
        .from('contact_tags')
        .select('id, tag')
        .eq('contact_id', id)
        .order('created_at', { ascending: false });
      setTags(tagData ?? []);

      const { data: noteData } = await supabase
        .from('contact_notes')
        .select('id, note, created_at, created_by')
        .eq('contact_id', id)
        .order('created_at', { ascending: false });
      setNotes(noteData ?? []);

      if (data?.email) {
        const { data: history } = await supabase
          .from('contact_submissions')
          .select('id, name, email, mobile, created_at')
          .eq('email', data.email)
          .order('created_at', { ascending: false });
        setVisits(history ?? []);
      }
    };

    load();
  }, [id]);

  const handleAddTags = async () => {
    if (!id) return;
    const tagsToApply = normalizeTags(tagInput);
    if (!tagsToApply.length) {
      toast.pushToast('Add at least one tag.', 'error');
      return;
    }

    const payload = tagsToApply.map((tag) => ({ contact_id: id, tag }));
    const { error } = await supabase.from('contact_tags').insert(payload);
    if (error) {
      toast.pushToast(error.message, 'error');
    } else {
      toast.pushToast('Tags added.', 'success');
      setTags((prev) => [...payload.map((item) => ({ id: crypto.randomUUID(), tag: item.tag })), ...prev]);
      setTagInput('');
    }
  };

  const handleAddNote = async () => {
    if (!id || !noteInput.trim()) {
      toast.pushToast('Write a note first.', 'error');
      return;
    }
    const { data, error } = await supabase
      .from('contact_notes')
      .insert({ contact_id: id, note: noteInput, created_by: user?.id ?? null })
      .select('id, note, created_at, created_by')
      .single();
    if (error) {
      toast.pushToast(error.message, 'error');
    } else if (data) {
      toast.pushToast('Note saved.', 'success');
      setNotes((prev) => [data, ...prev]);
      setNoteInput('');
    }
  };

  const fullPayload = useMemo(() => {
    if (!contact?.payload) return 'No payload stored.';
    return JSON.stringify(contact.payload, null, 2);
  }, [contact]);

  if (!contact) {
    return <p className="text-muted">Loading contact...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <Link to="/contacts" className="text-sm text-muted">Back to contacts</Link>
          <h2 className="text-3xl font-display text-brand">{contact.name || 'Guest'}</h2>
          <p className="text-muted">{contact.email || contact.mobile || 'No contact details'} · Connected {formatDateTime(contact.created_at)}</p>
        </div>
        <Link to="/campaigns/new" className="btn btn-outline">Create campaign</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-lg font-semibold mb-4">Visit history</h3>
          <div className="space-y-3">
            {visits.map((visit) => (
              <div key={visit.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <p className="font-semibold">{formatDateTime(visit.created_at)}</p>
                  <p className="text-sm text-muted">{visit.mobile || 'No mobile recorded'}</p>
                </div>
                <Badge tone="dark">{visit.email || 'No email'}</Badge>
              </div>
            ))}
            {!visits.length && <p className="text-sm text-muted">No previous visits recorded.</p>}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold mb-4">Tags</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.map((tag) => (
              <Badge key={tag.id} tone="accent">{tag.tag}</Badge>
            ))}
            {!tags.length && <p className="text-sm text-muted">No tags yet.</p>}
          </div>
          <Input label="Add tags" value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="vip, locals" />
          <Button className="mt-3" variant="outline" onClick={handleAddTags}>Save tags</Button>
        </Card>
      </div>

      <Card>
        <h3 className="text-lg font-semibold mb-4">Notes</h3>
        <div className="space-y-3 mb-4">
          {notes.map((note) => (
            <div key={note.id} className="border-b border-slate-100 pb-3">
              <p className="text-sm">{note.note}</p>
              <p className="text-xs text-muted">{formatDateTime(note.created_at)}</p>
            </div>
          ))}
          {!notes.length && <p className="text-sm text-muted">No notes yet.</p>}
        </div>
        <textarea
          className="input min-h-[120px]"
          placeholder="Add a note about this guest"
          value={noteInput}
          onChange={(event) => setNoteInput(event.target.value)}
        />
        <Button className="mt-3" variant="outline" onClick={handleAddNote}>Save note</Button>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold mb-4">Submission payload</h3>
        <pre className="text-xs bg-slate-50 rounded-xl p-4 overflow-x-auto">{fullPayload}</pre>
      </Card>
    </div>
  );
}
