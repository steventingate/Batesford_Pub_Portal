import { useEffect, useMemo, useState } from 'react';
import { subDays, format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { ChartBars } from '../components/ChartBars';
import { formatDateTime } from '../lib/format';

type Submission = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export default function Dashboard() {
  const [recent, setRecent] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [uniqueEmails, setUniqueEmails] = useState(0);
  const [returning, setReturning] = useState(0);
  const [chartLabels, setChartLabels] = useState<string[]>([]);
  const [chartValues, setChartValues] = useState<number[]>([]);

  useEffect(() => {
    const load = async () => {
      const { count } = await supabase
        .from('contact_submissions')
        .select('id', { count: 'exact', head: true });
      setTotal(count ?? 0);

      const sevenDaysAgo = subDays(new Date(), 6);
      const { data: recentData } = await supabase
        .from('contact_submissions')
        .select('id, full_name, email, phone, created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      const submissions = recentData ?? [];
      const byDay: Record<string, number> = {};
      const labels: string[] = [];

      for (let i = 6; i >= 0; i -= 1) {
        const day = subDays(new Date(), i);
        const key = format(day, 'yyyy-MM-dd');
        labels.push(format(day, 'EEE'));
        byDay[key] = 0;
      }

      submissions.forEach((item) => {
        const key = item.created_at.slice(0, 10);
        if (byDay[key] !== undefined) {
          byDay[key] += 1;
        }
      });

      setChartLabels(labels);
      setChartValues(Object.values(byDay));

      const { data: emailData } = await supabase
        .from('contact_submissions')
        .select('email')
        .not('email', 'is', null);

      const emails = (emailData ?? [])
        .map((row) => row.email?.toLowerCase().trim())
        .filter(Boolean) as string[];
      const unique = new Set(emails);
      setUniqueEmails(unique.size);

      const counts: Record<string, number> = {};
      emails.forEach((email) => {
        counts[email] = (counts[email] || 0) + 1;
      });
      const returningCount = Object.values(counts).filter((value) => value > 1).length;
      setReturning(returningCount);

      const { data: latest } = await supabase
        .from('contact_submissions')
        .select('id, full_name, email, phone, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      setRecent(latest ?? []);
    };

    load();
  }, []);

  const tiles = useMemo(
    () => [
      { label: 'Total connections', value: total },
      { label: 'Unique emails', value: uniqueEmails },
      { label: 'Returning guests', value: returning }
    ],
    [total, uniqueEmails, returning]
  );

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="text-3xl font-display text-brand">Dashboard</h2>
          <p className="text-muted">Live snapshot of guest Wi-Fi activity.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <p className="text-sm text-muted mb-3">{tile.label}</p>
            <p className="text-3xl font-semibold text-brand">{tile.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Last 7 days</h3>
            <p className="text-sm text-muted">Connections per day</p>
          </div>
        </div>
        <ChartBars labels={chartLabels} values={chartValues} />
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Recent connections</h3>
            <p className="text-sm text-muted">Latest 20 submissions</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2">Guest</th>
                <th className="py-2">Email</th>
                <th className="py-2">Mobile</th>
                <th className="py-2">Connected</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="py-2 font-semibold">{row.full_name || 'Guest'}</td>
                  <td className="py-2">{row.email || '-'}</td>
                  <td className="py-2">{row.phone || '-'}</td>
                  <td className="py-2">{formatDateTime(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
