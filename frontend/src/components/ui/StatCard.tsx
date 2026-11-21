import type { LucideIcon } from 'lucide-react';

export type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
};

export function StatCard({ label, value, detail, icon: Icon }: StatCardProps) {
  return (
    <article className="stat-card">
      <span className="stat-icon"><Icon size={22} aria-hidden="true" /></span>
      <div className="stat-copy">
        <h3>{label}</h3>
        <p className="stat-value">{value}</p>
        <p className="stat-detail">{detail}</p>
      </div>
    </article>
  );
}
