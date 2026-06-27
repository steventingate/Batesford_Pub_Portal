export type AutomationPreset = {
  name: string;
  triggerType: string;
  channel: 'email' | 'sms' | 'email_sms' | 'internal';
  description: string;
  template: {
    subject?: string;
    body: string;
  };
  segmentDefinition?: Record<string, unknown>;
};

export const automationPresets: AutomationPreset[] = [
  {
    name: 'First Visit Welcome',
    triggerType: 'first_visit_welcome',
    channel: 'email',
    description: 'A simple welcome after a guest joins Wi-Fi for the first time.',
    template: {
      subject: 'Thanks for visiting Batesford Hotel',
      body: 'Thanks for stopping by. We would love to see you again soon.'
    }
  },
  {
    name: 'After 3 Visits Thank You',
    triggerType: 'after_3_visits',
    channel: 'email',
    description: 'Thank regulars when they hit three visits.',
    template: {
      subject: 'Thanks for coming back',
      body: 'You have visited us a few times now. Thanks for being part of the Batesford crowd.'
    }
  },
  {
    name: 'Lapsed Guest Win-back',
    triggerType: 'lapsed_30_days',
    channel: 'email',
    description: 'Reach out when a guest has not returned for 30 days.',
    template: {
      subject: 'We have not seen you in a while',
      body: 'It has been a little while since your last visit. Drop back in and say hello.'
    }
  },
  {
    name: 'Regular Reward',
    triggerType: 'regular_customer_reward',
    channel: 'email',
    description: 'Reward frequent guests with a regular-customer nudge.',
    template: {
      subject: 'A little thank-you from Batesford',
      body: 'Thanks for being one of our regulars. We appreciate the support.'
    }
  },
  {
    name: 'Failed Authorization Alert',
    triggerType: 'failed_authorization_alert',
    channel: 'internal',
    description: 'Surface failed captive portal records for operational follow-up.',
    template: {
      body: 'This automation records a failed-auth alert run only and does not send marketing.'
    }
  }
];
