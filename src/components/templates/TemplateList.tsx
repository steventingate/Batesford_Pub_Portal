import { Button } from '../ui/Button';
import { formatDateTime } from '../../lib/format';
import { resolveStorageUrl } from '../../lib/storage';
import type { CampaignTemplate } from '../../types/templates';

type TemplateListProps = {
  templates: CampaignTemplate[];
  defaultHeroPath?: string | null;
  onEdit: (template: CampaignTemplate) => void;
  onView: (template: CampaignTemplate) => void;
  onDuplicate: (template: CampaignTemplate) => void;
  onDelete: (template: CampaignTemplate) => void;
};

export function TemplateList({
  templates,
  defaultHeroPath,
  onEdit,
  onView,
  onDuplicate,
  onDelete
}: TemplateListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-2">Name</th>
            <th className="py-2">Type</th>
            <th className="py-2">Hero</th>
            <th className="py-2">Created</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => {
            const heroPreview = resolveStorageUrl(template.hero_image_path ?? defaultHeroPath ?? '');
            return (
              <tr key={template.id} className="border-t border-slate-100">
                <td className="py-3 font-semibold text-brand">{template.name}</td>
                <td className="py-3 text-sm text-muted">{template.type}</td>
                <td className="py-3">
                  {heroPreview ? (
                    <img src={heroPreview} alt="" className="h-10 w-16 rounded-md object-cover border border-slate-200" />
                  ) : (
                    <span className="text-xs text-muted">No hero</span>
                  )}
                </td>
                <td className="py-3 text-sm text-muted">{formatDateTime(template.created_at)}</td>
                <td className="py-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => onEdit(template)}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => onView(template)}>
                    View
                  </Button>
                  <Button variant="ghost" onClick={() => onDuplicate(template)}>
                    Duplicate
                  </Button>
                  <Button variant="ghost" onClick={() => onDelete(template)}>
                    Delete
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!templates.length && <p className="text-center text-sm text-muted py-8">No templates yet.</p>}
    </div>
  );
}
