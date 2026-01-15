import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ToastProvider';
import { SegmentFilters, normalizeTags } from '../lib/segments';
import { defaultEmailTemplate } from '../lib/emailTemplate';
import { useAuth } from '../contexts/AuthContext';

const steps = ['Details', 'Segment', 'Content', 'Review'];

export default function CampaignNew() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('Batesford Pub');
  const [fromEmail, setFromEmail] = useState('hello@thebatesfordhotel.com.au');
  const [replyTo, setReplyTo] = useState('hello@thebatesfordhotel.com.au');
  const [segment, setSegment] = useState<SegmentFilters>({});
  const [includeTags, setIncludeTags] = useState('');
  const [excludeTags, setExcludeTags] = useState('');
  const [htmlBody, setHtmlBody] = useState(defaultEmailTemplate.trim());
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const totalSteps = steps.length - 1;

  const segmentPayload = useMemo(() => {
    return {
      ...segment,
      includeTags: normalizeTags(includeTags),
      excludeTags: normalizeTags(excludeTags)
    };
  }, [segment, includeTags, excludeTags]);

  const saveCampaign = async (status: 'draft' | 'scheduled' | 'sending') => {
    if (!name || !subject) {
      toast.pushToast('Add a campaign name and subject.', 'error');
      return null;
    }
    const { data, error } = await supabase
      .from('email_campaigns')
      .insert({
        name,
        subject,
        from_name: fromName,
        from_email: fromEmail,
        reply_to: replyTo,
        html_body: htmlBody,
        segment_json: segmentPayload,
        status,
        created_by: user?.id ?? null
      })
      .select('id')
      .single();

    if (error) {
      toast.pushToast(error.message, 'error');
      return null;
    }
    return data;
  };

  const handleSendNow = async () => {
    setSending(true);
    const record = await saveCampaign('sending');
    if (!record) {
      setSending(false);
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    const response = await fetch('/.netlify/functions/sendCampaign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.session?.access_token}`
      },
      body: JSON.stringify({ campaignId: record.id, mode: 'send' })
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      toast.pushToast(detail.error || 'Send failed.', 'error');
      setSending(false);
      return;
    }

    toast.pushToast('Campaign queued for sending.', 'success');
    navigate(`/campaigns/${record.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="text-3xl font-display text-brand">New campaign</h2>
          <p className="text-muted">Build a guest marketing email.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setStep(Math.max(step - 1, 0))}>Back</Button>
          <Button variant="outline" onClick={() => setStep(Math.min(step + 1, totalSteps))}>Next</Button>
        </div>
      </div>

      <div className="flex gap-2 text-sm">
        {steps.map((label, index) => (
          <div
            key={label}
            className={`px-3 py-1 rounded-full ${index === step ? 'bg-brand text-white' : 'bg-white/80 text-muted'}`}
          >
            {index + 1}. {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Campaign name" value={name} onChange={(event) => setName(event.target.value)} />
            <Input label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
            <Input label="From name" value={fromName} onChange={(event) => setFromName(event.target.value)} />
            <Input label="From email" value={fromEmail} onChange={(event) => setFromEmail(event.target.value)} />
            <Input label="Reply to" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} />
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Last seen within (days)"
              type="number"
              value={segment.lastSeenDays || ''}
              onChange={(event) => setSegment((prev) => ({ ...prev, lastSeenDays: Number(event.target.value) || undefined }))}
            />
            <Select
              label="Returning guests"
              value={segment.returningOnly ? 'yes' : 'no'}
              onChange={(event) => setSegment((prev) => ({ ...prev, returningOnly: event.target.value === 'yes' }))}
            >
              <option value="no">All guests</option>
              <option value="yes">Returning only</option>
            </Select>
            <Select
              label="Has email"
              value={segment.hasEmail ? 'yes' : 'no'}
              onChange={(event) => setSegment((prev) => ({ ...prev, hasEmail: event.target.value === 'yes' }))}
            >
              <option value="no">Any</option>
              <option value="yes">Email required</option>
            </Select>
            <Select
              label="Has mobile"
              value={segment.hasMobile ? 'yes' : 'no'}
              onChange={(event) => setSegment((prev) => ({ ...prev, hasMobile: event.target.value === 'yes' }))}
            >
              <option value="no">Any</option>
              <option value="yes">Mobile required</option>
            </Select>
            <Input label="Include tags" value={includeTags} onChange={(event) => setIncludeTags(event.target.value)} placeholder="vip, locals" />
            <Input label="Exclude tags" value={excludeTags} onChange={(event) => setExcludeTags(event.target.value)} placeholder="staff" />
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2">HTML editor</h3>
              <textarea
                className="input min-h-[380px] font-mono text-xs"
                value={htmlBody}
                onChange={(event) => setHtmlBody(event.target.value)}
              />
            </div>
            <div>
              <h3 className="font-semibold mb-2">Live preview</h3>
              <div className="card p-4 bg-white/80">
                <iframe title="preview" srcDoc={htmlBody} className="w-full min-h-[380px] border-0" />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted mt-3">Merge tags: {'{{first_name}}'}, {'{{email}}'}, {'{{venue_name}}'}</p>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <h3 className="text-lg font-semibold mb-4">Review</h3>
          <div className="space-y-2 text-sm">
            <p><span className="font-semibold">Name:</span> {name || 'Untitled'}</p>
            <p><span className="font-semibold">Subject:</span> {subject || '-'}</p>
            <p><span className="font-semibold">From:</span> {fromName} &lt;{fromEmail}&gt;</p>
            <p><span className="font-semibold">Segment:</span> {JSON.stringify(segmentPayload)}</p>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={async () => {
              const record = await saveCampaign('draft');
              if (record) {
                toast.pushToast('Campaign saved as draft.', 'success');
                navigate(`/campaigns/${record.id}`);
              }
            }}>Save draft</Button>
            <Button onClick={handleSendNow} disabled={sending}>{sending ? 'Sending...' : 'Send now'}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}


