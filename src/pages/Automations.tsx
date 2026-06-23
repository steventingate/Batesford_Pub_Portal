import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

const automationCards = [
  {
    title: 'Win back locals',
    description: 'Trigger a reminder for local guests who have not returned in 30 days.',
    status: 'Draft'
  },
  {
    title: 'Friday lunch promo',
    description: 'Queue a lunchtime campaign to guests with weekday visit patterns and email capture.',
    status: 'Ready'
  },
  {
    title: 'Birthday and loyalty placeholder',
    description: 'Reserve this flow for future birthday or loyalty-triggered sends once that data is available.',
    status: 'Planned'
  }
];

export default function Automations() {
  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Lifecycle</div>
          <h2 className="font-display text-4xl text-white">Automations</h2>
          <p className="max-w-2xl text-muted">Admin-ready automation concepts layered onto the current campaign system without changing the guest portal capture flow.</p>
        </div>
        <Button>Create automation</Button>
      </div>

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-3">
        {automationCards.map((card) => (
          <Card key={card.title}>
            <div className="status-pill">{card.status}</div>
            <h3 className="mt-4 text-xl font-semibold text-white">{card.title}</h3>
            <p className="mt-3 text-sm text-muted">{card.description}</p>
            <Button variant="outline" className="mt-5 w-full">Open workflow</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
