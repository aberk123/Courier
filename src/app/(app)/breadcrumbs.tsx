"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Crumb = { href: string; label: string };

/**
 * Derives the trail from the path rather than each page passing its own, so a
 * new screen gets navigation for free. Zone labels come from the database via
 * the layout, not from the URL, so a route Ari has named reads as its name
 * here and not as "Zone 4" -- recognition over recall, per docs/ux-notes.md.
 */
function crumbsFor(pathname: string, zoneLabels: Record<string, string>): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return [];

  if (segments[0] === "zones" && segments[1]) {
    const zone = segments[1];
    const trail: Crumb[] = [
      { href: `/zones/${zone}`, label: zoneLabels[zone] ?? `Zone ${zone}` },
    ];
    if (segments[2] === "cover") {
      trail.push({ href: `/zones/${zone}/cover`, label: "Cover sheet & print" });
    }
    return trail;
  }
  if (segments[0] === "import") return [{ href: "/import", label: "Weekly import" }];
  if (segments[0] === "users") return [{ href: "/users", label: "Manage users" }];
  return [];
}

export function Breadcrumbs({ zoneLabels }: { zoneLabels: Record<string, string> }) {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname ?? "/", zoneLabels);

  // On the home screen the trail would just say "Home", which is noise.
  if (!crumbs.length) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="border-b border-black/10 py-2 dark:border-white/10"
    >
      {/* Padding belongs inside the max-width box, matching how every page wraps
          its content, or the trail sits a notch left of the heading below it. */}
      <ol className="mx-auto flex w-full max-w-3xl items-center gap-1.5 overflow-x-auto whitespace-nowrap px-4 text-sm">
        <li>
          <Link
            href="/"
            className="rounded px-1 py-0.5 text-black/60 underline underline-offset-2 hover:text-black dark:text-white/60 dark:hover:text-white"
          >
            Home
          </Link>
        </li>
        {crumbs.map((crumb, index) => {
          const isCurrent = index === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-black/30 dark:text-white/30">
                /
              </span>
              {isCurrent ? (
                // The page you are on is not a link -- tapping it would do
                // nothing, which on a phone reads as the app being broken.
                <span aria-current="page" className="font-medium">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="rounded px-1 py-0.5 text-black/60 underline underline-offset-2 hover:text-black dark:text-white/60 dark:hover:text-white"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
