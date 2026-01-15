import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { formatDateTime, toCsv } from '../lib/format';
import { useToast } from '../components/ToastProvider';
import { normalizeTags } from '../lib/segments';

type ContactRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  marketing_opt_in?: boolean | null;
};

type ContactTag = {
  contact_id: string;
  tag: string;
};

export default function Contacts() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [tags, setTags] = useState<ContactTag[]>([]);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('30');
  const [hasEmail, setHasEmail] = useState('all');
  const [returningOnly, setReturningOnly] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [tagInput, setTagInput] = useState('');
  const toast = useToast();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('contact_submissions')
        .select('id, full_name, email, phone, created_at, marketing_opt_in')
        .order('created_at', { ascending: false })
        .limit(500);

      setContacts(data ?? []);

      const { data: tagData } = await supabase
        .from('contact_tags')
        .select('contact_id, tag');
      setTags(tagData ?? []);
    };

    load();
  }, []);

  const contactTags = useMemo(() => {
    const map: Record<string, string[]> = {};
    tags.forEach((tag) => {
      if (!map[tag.contact_id]) map[tag.contact_id] = [];
      map[tag.contact_id].push(tag.tag);
    });
    return map;
  }, [tags]);

  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(dateRange));
    const searchLower = search.toLowerCase();

    const withEmailCounts: Record<string, number> = {};
    contacts.forEach((contact) => {
      if (contact.email) {
        const key = contact.email.toLowerCase();
        withEmailCounts[key] = (withEmailCounts[key] || 0) + 1;
      }
    });

    return contacts.filter((contact) => {
      const matchesSearch =
        !searchLower ||
        [contact.full_name, contact.email, contact.phone]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(searchLower));

      if (!matchesSearch) return false;

      if (dateRange !== 'all') {
        const created = new Date(contact.created_at);
        if (created < cutoff) return false;
      }

      if (hasEmail === 'yes' && !contact.email) return false;
      if (hasEmail === 'no' && contact.email) return false;

      if (returningOnly) {
        const count = contact.email ? withEmailCounts[contact.email.toLowerCase()] : 0;
        if (count < 2) return false;
      }

      return true;
    });
  }, [contacts, search, dateRange, hasEmail, returningOnly]);

  const selectedIds = Object.keys(selected).filter((key) => selected[key]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    filtered.forEach((contact) => {
      next[contact.id] = true;
    });
    setSelected(next);
  };

  const handleExport = () => {
    const rows = filtered.map((contact) => ({
      name: contact.full_name ?? '',
      email: contact.email ?? '',
      mobile: contact.phone ?? '',
      connected_at: contact.created_at,
      marketing_opt_in: contact.marketing_opt_in ?? false
    }));
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'batesford-contacts.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const applyTags = async (mode: 'add' | 'remove') => {
    const tagsToApply = normalizeTags(tagInput);
    if (!tagsToApply.length) {
      toast.pushToast('Add at least one tag.', 'error');
      return;
    }
    if (!selectedIds.length) {
      toast.pushToast('Select at least one contact.', 'error');
      return;
    }

    if (mode === 'add') {
      const payload = selectedIds.flatMap((contactId) =>
        tagsToApply.map((tag) => ({ contact_id: contactId, tag }))
      );
      const { error } = await supabase.from('contact_tags').insert(payload);
      if (error) {
        toast.pushToast(error.message, 'error');
      } else {
        toast.pushToast('Tags added.', 'success');
        setTags((prev) => [...prev, ...payload]);
      }
    } else {
      const { error } = await supabase
        .from('contact_tags')
        .delete()
        .in('contact_id', selectedIds)
        .in('tag', tagsToApply);
      if (error) {
        toast.pushToast(error.message, 'error');
      } else {
        toast.pushToast('Tags removed.', 'success');
        setTags((prev) => prev.filter((tag) => !selectedIds.includes(tag.contact_id) || !tagsToApply.includes(tag.tag)));
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="text-3xl font-display text-brand">Contacts</h2>
          <p className="text-muted">Search and segment guest Wi-Fi submissions.</p>
        </div>
        <Button variant="outline" onClick={handleExport}>Export CSV</Button>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, mobile" />
          <Select label="Date range" value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </Select>
          <Select label="Has email" value={hasEmail} onChange={(event) => setHasEmail(event.target.value)}>
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
          <label className="flex items-end gap-2 text-sm font-semibold text-muted">
            <input
              type="checkbox"
              checked={returningOnly}
              onChange={(event) => setReturningOnly(event.target.checked)}
              className="h-4 w-4"
            />
            Returning only
          </label>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input
            label="Bulk tags"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="vip, lunch, locals"
            className="max-w-sm"
          />
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => applyTags('add')}>Add tags</Button>
            <Button variant="outline" onClick={() => applyTags('remove')}>Remove tags</Button>
          </div>
          <div className="ml-auto text-sm text-muted">Selected {selectedIds.length}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Mobile</th>
                <th className="py-2">Tags</th>
                <th className="py-2">Connected</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => (
                <tr key={contact.id} className="border-t border-slate-100">
                  <td className="py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[contact.id])}
                      onChange={(event) => setSelected((prev) => ({ ...prev, [contact.id]: event.target.checked }))}
                    />
                  </td>
                  <td className="py-3 font-semibold">
                    <Link to={`/contacts/${contact.id}`} className="text-brand">
                      {contact.full_name || 'Guest'}
                    </Link>
                  </td>
                  <td className="py-3">{contact.email || '-'}</td>
                  <td className="py-3">{contact.phone || '-'}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      {(contactTags[contact.id] || []).map((tag) => (
                        <Badge key={`${contact.id}-${tag}`} tone="dark">{tag}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="py-3">{formatDateTime(contact.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="text-center text-sm text-muted py-8">No contacts match this filter.</p>}
        </div>
      </Card>
    </div>
  );
}

