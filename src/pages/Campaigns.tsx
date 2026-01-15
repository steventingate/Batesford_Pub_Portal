import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { formatDateTime } from '../lib/format';
import { buildSegmentSummary } from '../lib/segments';

type Campaign = {
  id: string;
  name: string;
  subject: string;
  status: string;
  created_at: string;
  scheduled_for: string | null;
  segment_json: Record<string, unknown> | null;
};

type SendRow = { campaign_id: string; status: string };

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sends, setSends] = useState<SendRow[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('email_campaigns')
        .select('id, name, subject, status, created_at, scheduled_for, segment_json')
        .order('created_at', { ascending: false });

      setCampaigns(data ?? []);

      const { data: sendData } = await supabase
        .from('email_sends')
        .select('campaign_id, status');
      setSends(sendData ?? []);
    };

    load();
  }, []);

  const metrics = useMemo(() => {
    const map: Record<string, { sent: number; failed: number }> = {};
    sends.forEach((send) => {
      if (!map[send.campaign_id]) {
        map[send.campaign_id] = { sent: 0, failed: 0 };
      }
      if (send.status === 'sent') map[send.campaign_id].sent += 1;
      if (send.status === 'failed') map[send.campaign_id].failed += 1;
    });
    return map;
  }, [sends]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="text-3xl font-display text-brand">Campaigns</h2>
          <p className="text-muted">Build and send targeted guest emails.</p>
        </div>
        <Link to="/campaigns/new" className="btn btn-primary">New campaign</Link>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2">Campaign</th>
                <th className="py-2">Status</th>
                <th className="py-2">Segment</th>
                <th className="py-2">Sent</th>
                <th className="py-2">Failed</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-t border-slate-100">
                  <td className="py-3">
                    <Link to={`/campaigns/${campaign.id}`} className="font-semibold text-brand">
                      {campaign.name}
                    </Link>
                    <p className="text-xs text-muted">{campaign.subject}</p>
                  </td>
                  <td className="py-3">
                    <Badge tone="dark">{campaign.status}</Badge>
                  </td>
                  <td className="py-3 text-xs text-muted">
                    {buildSegmentSummary((campaign.segment_json || {}) as never) || 'All guests'}
                  </td>
                  <td className="py-3">{metrics[campaign.id]?.sent ?? 0}</td>
                  <td className="py-3">{metrics[campaign.id]?.failed ?? 0}</td>
                  <td className="py-3">{formatDateTime(campaign.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!campaigns.length && <p className="text-center text-sm text-muted py-8">No campaigns yet.</p>}
        </div>
      </Card>
    </div>
  );
}

