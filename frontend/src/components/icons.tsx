type P = { className?: string }
const base = 'h-6 w-6'
const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const HomeIcon = ({ className }: P) => (
  <svg className={className ?? base} viewBox="0 0 24 24" {...common}><path d="M3 10.7 12 4l9 6.7" /><path d="M5.5 9.5V20h13V9.5" /></svg>
)
export const FireIcon = ({ className }: P) => (
  <svg className={className ?? base} viewBox="0 0 24 24" {...common}><path d="M12 3c.6 3-1.5 4.2-2.6 6C8 11 8 13 8 13.5a4 4 0 1 0 8 0c0-1.7-.8-3.2-1.7-4.2.3 1.4-.4 2.3-1.1 2.6.6-2.6-1.2-4.8-1.2-8.9Z" /></svg>
)
export const UserIcon = ({ className }: P) => (
  <svg className={className ?? base} viewBox="0 0 24 24" {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" /></svg>
)
export const SearchIcon = ({ className }: P) => (
  <svg className={className ?? base} viewBox="0 0 24 24" {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
)
export const ShieldIcon = ({ className }: P) => (
  <svg className={className ?? base} viewBox="0 0 24 24" {...common}><path d="M12 3l7 3v5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3Z" /></svg>
)
export const MapIcon = ({ className }: P) => (
  <svg className={className ?? base} viewBox="0 0 24 24" {...common}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14" /><path d="M15 6v14" /></svg>
)
export const RadarIcon = ({ className }: P) => (
  <svg className={className ?? base} viewBox="0 0 24 24" {...common}><path d="M12 12 7 7" /><path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 8a4 4 0 1 0 4 4" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></svg>
)
