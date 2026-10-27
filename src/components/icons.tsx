import type { ReactNode, SVGProps } from "react";

export type IconName = "arrow" | "bag" | "heart" | "search" | "menu" | "close" | "plus" | "minus" | "check" | "leaf" | "globe" | "hand" | "sparkle" | "download" | "user";
const paths: Record<IconName, ReactNode> = {
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  arrow: <path d="M20 12H4m6-6-6 6 6 6" />,
  bag: <><path d="m5 7-1 14h16L19 7H5Z" /><path d="M8 9V6a4 4 0 0 1 8 0v3" /></>,
  heart: <path d="M20.8 4.6a5.6 5.6 0 0 0-7.9 0L12 5.5l-.9-.9a5.6 5.6 0 0 0-7.9 7.9L12 21l8.8-8.5a5.6 5.6 0 0 0 0-7.9Z" />,
  search: <><circle cx="10.7" cy="10.7" r="7.4" /><path d="m16 16 5 5" /></>,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  leaf: <><path d="M12 21C3 20 2 11 3 7c5 0 8 4 9 9M12 21c9-1 10-10 9-14-5 0-8 4-9 9" /><path d="M12 20C7 14 7 7 12 2c5 5 5 12 0 18Z" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 6h14M5 18h14" /></>,
  hand: <><path d="M3 14h3l4-3h4a2 2 0 0 1 0 4h-3m4 0 4-3a2 2 0 0 1 3 2l-7 6H8l-5-2V14Z" /><path d="m14 8-4-3a2.5 2.5 0 0 1 4-3 2.5 2.5 0 0 1 4 3l-4 3Z" /></>,
  sparkle: <path d="M12 1c1 8 3 10 11 11-8 1-10 3-11 11C11 15 9 13 1 12c8-1 10-3 11-11Z" />,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
};
export function Icon({ name, size = 24, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
export function Star({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true"><path d="M20 0c2.3 14.3 5.7 17.7 20 20-14.3 2.3-17.7 5.7-20 20C17.7 25.7 14.3 22.3 0 20 14.3 17.7 17.7 14.3 20 0Z" /></svg>;
}
export function Logo({ className = "" }: { className?: string }) {
  const stars = [[15, 12], [33, 12], [51, 12], [69, 12], [69, 30], [69, 48], [69, 66]];
  return <span className={`brand-logo ${className}`} dir="ltr" aria-label="سون اسپارکلز">
    <svg className="brand-mark" viewBox="0 0 82 82" fill="currentColor" aria-hidden="true">{stars.map(([x, y], i) => <g key={i}><path d={`M${x} ${y - 8}q1.5 6.5 8 8-6.5 1.5-8 8-1.5-6.5-8-8 6.5-1.5 8-8Z`} /><path d={`M${x - 4} ${y + 4} ${Math.max(1, x - 40)} ${Math.min(81, y + 45)} ${x - 1} ${y + 6}Z`} /></g>)}</svg>
    <span className="brand-wordmark">Seven<span>Sparkles</span></span>
  </span>;
}
