import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export default function Vouchers() {
  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Offer Tracking</div>
          <h2 className="font-display text-4xl text-white">Vouchers</h2>
          <p className="max-w-2xl text-muted">Voucher creation and redemption tracking are queued for the next stage. The route is live so the expanded navigation stays coherent.</p>
        </div>
        <Button variant="outline">Stage 2</Button>
      </div>
      <Card>
        <h3 className="text-xl font-semibold text-white">What lands next</h3>
        <p className="mt-3 max-w-2xl text-sm text-muted">Voucher codes, redemption limits, linked campaigns, and a simple staff redemption flow will be added without touching the current UniFi authorization path.</p>
      </Card>
    </div>
  );
}
