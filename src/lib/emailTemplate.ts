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
        text-align: center;
      }
      .social {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #efe6d8;
        text-align: center;
      }
      .social-title {
        margin: 0 0 10px;
        font-size: 12px;
        font-weight: 600;
        color: #1f2a24;
      }
      .social-icons a {
        display: inline-block;
        margin: 0 6px;
      }
      .social-icons img {
        width: 28px;
        height: 28px;
        display: block;
        border: 0;
      }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <h1>Hello {{first_name}},</h1>
        <p>Thanks for dropping into {{venue_name}}. We have a new seasonal menu and weekend specials ready for you.</p>
        <p><a class="cta" href="https://www.thebatesfordhotel.com.au/">See what is on</a></p>
        <div class="social">
          <p class="social-title">Follow us</p>
          <div class="social-icons">
            <a href="https://www.facebook.com/"><img src="https://cdn.simpleicons.org/facebook/1a472a" alt="Facebook" /></a>
            <a href="https://www.instagram.com/"><img src="https://cdn.simpleicons.org/instagram/1a472a" alt="Instagram" /></a>
            <a href="https://www.tiktok.com/"><img src="https://cdn.simpleicons.org/tiktok/1a472a" alt="TikTok" /></a>
            <a href="https://x.com/"><img src="https://cdn.simpleicons.org/x/1a472a" alt="X" /></a>
            <a href="https://www.linkedin.com/"><img src="https://cdn.simpleicons.org/linkedin/1a472a" alt="LinkedIn" /></a>
          </div>
        </div>
        <p class="footer">You are receiving this because you joined our guest Wi-Fi. Unsubscribe anytime by replying to this email.</p>
      </div>
    </div>
  </body>
</html>
`;
