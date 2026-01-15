import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { formatDateTime } from '../lib/format';
import { useToast } from '../components/ToastProvider';
import { buildSegmentSummary } from '../lib/segments';

type Campaign = {
  id: string;
  name: string;
  subject: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  html_body: string;
  status: string;
  created_at: string;
  segment_json: Record<string, unknown> | null;
};

type SendRow = { id: string; status: string; to_email: string | null; sent_at: string | null; error: string | null; };

export default function CampaignDetail() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sends, setSends] = useState<SendRow[]>([]);
  const toast = useToast();

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const { data } = await supabase
        .from('email_campaigns')
        .select('*')
        .eq('id', id)
        .single();
      setCampaign(data ?? null);

      const { data: sendData } = await supabase
        .from('email_sends')
        .select('id, status, to_email, sent_at, error')
        .eq('campaign_id', id)
        .order('created_at', { ascending: false });
      setSends(sendData ?? []);
    };

    load();
  }, [id]);

  const metrics = useMemo(() => {
    return {
      sent: sends.filter((item) => item.status === 'sent').length,
      failed: sends.filter((item) => item.status === 'failed').length
    };
  }, [sends]);

  const sendTest = async () => {
    const email = window.prompt('Send test email to:');
    if (!email || !campaign) return;

    const { data: session } = await supabase.auth.getSession();
    const response = await fetch('/.netlify/functions/sendCampaign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.session?.access_token}`
      },
      body: JSON.stringify({ campaignId: campaign.id, mode: 'test', testEmail: email })
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      toast.pushToast(detail.error || 'Test send failed.', 'error');
      return;
    }

    toast.pushToast('Test email sent.', 'success');
  };

  if (!campaign) {
    return <p className="text-muted">Loading campaign...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="text-3xl font-display text-brand">{campaign.name}</h2>
          <p className="text-muted">{campaign.subject}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={sendTest}>Send test</Button>
          <Badge tone="dark">{campaign.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-muted">Sent</p>
          <p className="text-2xl font-semibold text-brand">{metrics.sent}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Failed</p>
          <p className="text-2xl font-semibold text-brand">{metrics.failed}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Created</p>
          <p className="text-sm font-semibold">{formatDateTime(campaign.created_at)}</p>
        </Card>
      </div>

      <Card>
        <h3 className="text-lg font-semibold mb-2">Segment</h3>
        <p className="text-sm text-muted">{buildSegmentSummary((campaign.segment_json || {}) as never) || 'All guests'}</p>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold mb-4">Email body</h3>
        <div className="card p-4 bg-white/80">
          <iframe title="preview" srcDoc={campaign.html_body} className="w-full min-h-[340px] border-0" />
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold mb-4">Send log</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2">Recipient</th>
                <th className="py-2">Status</th>
                <th className="py-2">Sent at</th>
                <th className="py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {sends.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="py-2">{row.to_email}</td>
                  <td className="py-2"><Badge tone="dark">{row.status}</Badge></td>
                  <td className="py-2">{row.sent_at ? formatDateTime(row.sent_at) : '-'}</td>
                  <td className="py-2 text-xs text-muted">{row.error || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sends.length && <p className="text-center text-sm text-muted py-8">No sends yet.</p>}
        </div>
      </Card>
    </div>
  );
}

