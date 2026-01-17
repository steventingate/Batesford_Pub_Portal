import type { InlineImage } from '../lib/emailRenderer';

export type CampaignTemplate = {
  id: string;
  name: string;
  type: string;
  subject: string;
  body_html: string;
  body_text: string;
  hero_image_path?: string | null;
  footer_image_path?: string | null;
  inline_images?: InlineImage[] | null;
  created_at: string;
};

export type EditorState = {
  id: string | null;
  name: string;
  type: string;
  subject: string;
  bodyHtml: string;
  heroImagePath: string | null;
  footerImagePath: string | null;
  inlineImages: InlineImage[];
};
