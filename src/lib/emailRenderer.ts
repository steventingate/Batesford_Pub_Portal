import { resolveStorageUrl } from './storage';

export type InlineImage = {
  path: string;
  alt?: string;
  sort?: number;
};

export type EmailTemplatePayload = {
  subject: string;
  body_html: string;
  hero_image_path?: string | null;
  footer_image_path?: string | null;
  inline_images?: InlineImage[] | null;
};

export type BrandingPayload = {
  logo_path?: string | null;
  default_hero_path?: string | null;
  footer_banner_path?: string | null;
};

type RenderOverrides = {
  hero_image_path?: string | null;
  footer_image_path?: string | null;
  inline_images?: InlineImage[] | null;
};

const stripEmptyImages = (html: string) => {
  return html.replace(/<img[^>]*src=['"]{0,1}['"]{0,1}[^>]*>/gi, '');
};

const applyTokens = (template: string, tokens: Record<string, string>) => {
  let result = template;
  Object.entries(tokens).forEach(([key, value]) => {
    result = result.split(`{{${key}}}`).join(value);
  });
  return stripEmptyImages(result);
};

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const normalizeInlineTokenHtml = (value: string) => {
  return value
    .replace(/&amp;quot;|&amp;#34;/gi, '"')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&amp;#91;|&amp;#93;/gi, (match) => (match.includes('91') ? '[' : ']'))
    .replace(/&amp;lbrack;|&amp;rbrack;/gi, (match) => (match.includes('lbrack') ? '[' : ']'))
    .replace(/&#91;|&lbrack;/gi, '[')
    .replace(/&#93;|&rbrack;/gi, ']');
};

const replaceInlineImageTokens = (html: string) => {
  const normalizedHtml = normalizeInlineTokenHtml(html);
  return normalizedHtml.replace(/\[\[image:([^\]]+)\]\]/gi, (_match, attrs) => {
    const pathMatch = attrs.match(/path=(?:"([^"]+)"|'([^']+)')/i);
    if (!pathMatch) return '';
    const altMatch = attrs.match(/alt=(?:"([^"]*)"|'([^']*)')/i);
    const path = pathMatch[1] || pathMatch[2];
    const altText = altMatch ? (altMatch[1] || altMatch[2]) : '';
    const url = resolveStorageUrl(path);
    if (!url) return '';
    const alt = escapeHtml(altText);
    return (
      `<br />` +
      `<img src="${url}" alt="${alt}" width="600" ` +
      `style="display:block;width:100%;max-width:600px;height:auto;border:0;line-height:0;margin:12px 0;" />` +
      `<br />`
    );
  });
};

export const stripInlineImageTokens = (value: string) => {
  return value.replace(/\[\[image:[^\]]+\]\]/gi, '');
};

const buildEmailShell = (bodyHtml: string, options: { logoUrl: string; heroUrl: string; footerUrl: string; footerText: string }) => {
  const logoRow = options.logoUrl
    ? `<tr>
        <td style="padding:24px 24px 8px;">
          <img src="${options.logoUrl}" alt="Batesford Pub" width="180" style="display:block;max-width:180px;height:auto;border:0;" />
        </td>
      </tr>`
    : '';
  const heroRow = options.heroUrl
    ? `<tr>
        <td style="padding:0 24px 16px;">
          <img src="${options.heroUrl}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;line-height:0;" />
        </td>
      </tr>`
    : '';
  const footerImageRow = options.footerUrl
    ? `<tr>
        <td style="padding:16px 24px 0;">
          <img src="${options.footerUrl}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;line-height:0;" />
        </td>
      </tr>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Batesford Pub</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f3ed;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f6f3ed;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e6dfd3;">
            ${logoRow}
            ${heroRow}
            <tr>
              <td style="padding:0 24px 8px;font-family:'Source Sans 3', Arial, sans-serif;font-size:16px;line-height:24px;color:#1f2a24;">
                ${bodyHtml}
              </td>
            </tr>
            ${footerImageRow}
            <tr>
              <td style="padding:12px 24px 24px;font-family:'Source Sans 3', Arial, sans-serif;font-size:12px;line-height:18px;color:#6b7a71;">
                ${options.footerText}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export const renderEmailHtml = ({
  template,
  branding,
  variables,
  overrides
}: {
  template: EmailTemplatePayload;
  branding: BrandingPayload;
  variables: Record<string, string>;
  overrides?: RenderOverrides;
}) => {
  const heroPath = overrides?.hero_image_path ?? template.hero_image_path ?? branding.default_hero_path ?? '';
  const footerPath = overrides?.footer_image_path ?? template.footer_image_path ?? branding.footer_banner_path ?? '';
  const logoUrl = resolveStorageUrl(branding.logo_path ?? '');
  const heroUrl = resolveStorageUrl(heroPath);
  const footerUrl = resolveStorageUrl(footerPath);

  const tokens = {
    ...variables,
    brand_logo_url: logoUrl,
    hero_image_url: heroUrl,
    footer_banner_url: footerUrl
  };

  const bodyWithInlineImages = replaceInlineImageTokens(template.body_html);
  const hasLogoToken = template.body_html.includes('{{brand_logo_url}}');
  const hasHeroToken = template.body_html.includes('{{hero_image_url}}');
  const hasFooterToken = template.body_html.includes('{{footer_banner_url}}');
  const resolvedBody = applyTokens(bodyWithInlineImages, tokens);
  const footerText = applyTokens('{{venue_address}} | {{website_link}}', tokens);

  return {
    subject: applyTokens(template.subject, tokens),
    html: buildEmailShell(resolvedBody, {
      logoUrl: hasLogoToken ? '' : logoUrl,
      heroUrl: hasHeroToken ? '' : heroUrl,
      footerUrl: hasFooterToken ? '' : footerUrl,
      footerText
    })
  };
};
