export const defaultEmailTemplate = `
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Batesford Pub</title>
    <style>
      body {
        margin: 0;
        font-family: 'Source Sans 3', Arial, sans-serif;
        background: #f6f3ed;
        color: #1f2a24;
      }
      .wrapper {
        padding: 24px;
      }
      .card {
        max-width: 640px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 18px;
        padding: 32px;
        box-shadow: 0 12px 30px rgba(20, 35, 28, 0.16);
      }
      h1 {
        font-family: 'Fraunces', Georgia, serif;
        color: #1a472a;
        margin-top: 0;
      }
      .cta {
        display: inline-block;
        padding: 12px 18px;
        background: #1a472a;
        color: #ffffff;
        border-radius: 10px;
        text-decoration: none;
        font-weight: 600;
      }
      .footer {
        margin-top: 24px;
        font-size: 12px;
        color: #6b7a71;
      }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <h1>Hello {{first_name}},</h1>
        <p>Thanks for dropping into {{venue_name}}. We have a new seasonal menu and weekend specials ready for you.</p>
        <p><a class="cta" href="https://www.thebatesfordhotel.com.au/">See what is on</a></p>
        <p class="footer">You are receiving this because you joined our guest Wi-Fi. Unsubscribe anytime by replying to this email.</p>
      </div>
    </div>
  </body>
</html>
`;
