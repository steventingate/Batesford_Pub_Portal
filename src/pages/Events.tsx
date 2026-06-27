import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export default function Events() {
  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Venue Performance</div>
          <h2 className="font-display text-4xl text-white">Events</h2>
          <p className="max-w-2xl text-muted">Event performance is staged after vouchers so each event can tie cleanly into campaigns, postcodes, and return-visit tracking.</p>
        </div>
        <Button variant="outline">Stage 3</Button>
      </div>
      <Card>
        <h3 className="text-xl font-semibold text-white">Planned event metrics</h3>
        <p className="mt-3 max-w-2xl text-sm text-muted">Upcoming work covers event windows, new vs returning attendance, top postcodes, and post-event return behaviour.</p>
      </Card>
    </div>
  );
}
