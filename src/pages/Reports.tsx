import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ToastProvider';
import { ChartCard, HorizontalBars, Info } from '../components/admin/AdminComponents';
import { StackedBarChart, TimelineChart } from '../components/admin/AdminCharts';
import { buildReportCsvRows, buildVenueInsightsSummary, getInsightsRange, loadVenueInsightsBundle, type DatePreset, type VenueInsightsSummary } from '../lib/venueInsights';
import { toCsv } from '../lib/format';
import { supabase } from '../lib/supabaseClient';

const reportTypes = [
  { value: 'daily', label: 'Daily venue report', preset: 'today' as DatePreset },
  { value: 'weekly', label: 'Weekly venue report', preset: 'last7' as DatePreset },
  { value: 'monthly', label: 'Monthly venue report', preset: 'month' as DatePreset }
];

export default function Reports() {
  const { pushToast } = useToast();
  const [reportType, setReportType] = useState('weekly');
  const [summary, setSummary] = useState<VenueInsightsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  const selectedReport = useMemo(
    () => reportTypes.find((item) => item.value === reportType) ?? reportTypes[1],
    [reportType]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const range = getInsightsRange(selectedReport.preset);
        const bundle = await loadVenueInsightsBundle(range);
        if (!cancelled) {
          setSummary(buildVenueInsightsSummary(bundle, range));
        }
      } catch (error) {
        if (!cancelled) {
          pushToast(`Unable to load reports: ${(error as Error).message}`, 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [pushToast, selectedReport.preset]);

  const exportCsv = () => {
    if (!summary) return;
    const csv = toCsv(buildReportCsvRows(summary));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `batesford-${reportType}-report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const saveSnapshot = async () => {
    if (!summary) return;
    setSavingSnapshot(true);
    const { error } = await supabase.from('report_snapshots').insert({
      report_type: reportType,
      period_start: summary.range.start.toISOString(),
      period_end: summary.range.end.toISOString(),
      summary: {
        metrics: {
          uniqueGuests: summary.uniqueGuests,
          newGuests: summary.newGuests,
          returningGuests: summary.returningGuests,
          totalVisits: summary.totalVisits,
          guestsWithEmail: summary.guestsWithEmail,
          guestsWithMobile: summary.guestsWithMobile,
          consentRate: summary.consentRate,
          unsubscribedCount: summary.unsubscribedCount,
          averageVisitsPerGuest: summary.averageVisitsPerGuest,
          topPostcode: summary.topPostcode,
          peakDayOfWeek: summary.peakDayOfWeek,
          peakHourOfDay: summary.peakHourOfDay
        },
        insights: summary.insights
      }
    });
    setSavingSnapshot(false);

    if (error) {
      pushToast(`Could not save snapshot: ${error.message}`, 'error');
      return;
    }
    pushToast('Report snapshot saved.', 'success');
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Venue Reports</div>
          <h2 className="font-display text-4xl text-white">Reports</h2>
          <p className="max-w-2xl text-muted">Plain-English reporting for managers who need the story, the key numbers, and a CSV export without digging through raw tables.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={exportCsv} disabled={!summary}>Export CSV</Button>
          <Button onClick={saveSnapshot} disabled={!summary || savingSnapshot}>
            {savingSnapshot ? 'Saving...' : 'Save snapshot'}
          </Button>
        </div>
      </div>

      <Card className="max-w-sm">
        <Select label="Report type" value={reportType} onChange={(event) => setReportType(event.target.value)}>
          {reportTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Card>

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-4">
        <Card><Info label="Unique guests" value={loading || !summary ? '...' : String(summary.uniqueGuests)} /></Card>
        <Card><Info label="New guests" value={loading || !summary ? '...' : String(summary.newGuests)} /></Card>
        <Card><Info label="Returning guests" value={loading || !summary ? '...' : String(summary.returningGuests)} /></Card>
        <Card><Info label="Peak window" value={loading || !summary ? '...' : `${summary.peakDayOfWeek} / ${summary.peakHourOfDay}`} /></Card>
      </div>

      <div className="admin-grid xl:grid-cols-[1.15fr_0.85fr]">
        <ChartCard
          title={selectedReport.label}
          subtitle={summary ? `${summary.range.label}: ${summary.range.start.toLocaleDateString('en-AU')} to ${summary.range.end.toLocaleDateString('en-AU')}` : 'Loading report window'}
        >
          <div className="space-y-3">
            {(summary?.insights ?? ['Loading generated summary...']).map((line) => (
              <div key={line} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white">
                {line}
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Report focus" subtitle="The first things a venue manager usually wants to know.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card tone="muted">
              <Info label="Top postcode" value={summary?.topPostcode ?? '-'} />
            </Card>
            <Card tone="muted">
              <Info label="Guests with email" value={summary ? String(summary.guestsWithEmail) : '-'} />
            </Card>
            <Card tone="muted">
              <Info label="Consent rate" value={summary ? `${summary.consentRate}%` : '-'} />
            </Card>
            <Card tone="muted">
              <Info label="Unsubscribed" value={summary ? String(summary.unsubscribedCount) : '-'} />
            </Card>
          </div>
        </ChartCard>
      </div>

      <div className="admin-grid xl:grid-cols-[1.1fr_0.9fr]">
        <ChartCard title="Visits over time" subtitle="Venue pulse for the selected reporting period.">
          <TimelineChart points={summary?.visitSeries ?? []} />
        </ChartCard>
        <ChartCard title="New vs returning" subtitle="Unique guests per day, split by first-timers and repeat visitors.">
          <StackedBarChart
            points={summary?.newReturningSeries ?? []}
            legends={['New', 'Returning']}
            colors={['linear-gradient(180deg, rgba(110,240,193,0.95), rgba(38,186,127,0.95))', 'linear-gradient(180deg, rgba(59,130,246,0.95), rgba(29,78,216,0.95))']}
          />
        </ChartCard>
      </div>

      <div className="admin-grid xl:grid-cols-[0.95fr_1.05fr]">
        <ChartCard title="Top postcodes" subtitle="Best-performing catchments in the current report window.">
          <HorizontalBars
            items={(summary?.topPostcodes ?? []).map((row) => ({
              label: row.postcode,
              value: row.guests
            }))}
          />
        </ChartCard>
        <ChartCard title="Status breakdown" subtitle="How those sessions resolved across the selected window.">
          <HorizontalBars
            items={(summary?.statusBreakdown ?? []).map((row) => ({
              label: row.label,
              value: row.value
            }))}
          />
        </ChartCard>
      </div>
    </div>
  );
}
