import Link from "next/link";
import { Headphones, Heart, Home, Radio, type LucideIcon } from "lucide-react";

const items: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Discover", icon: Home },
  { href: "/library", label: "Library", icon: Heart },
  { href: "/playlist/spotify-featured", label: "Featured", icon: Radio },
];

export function Sidebar() {
  return (
    <aside className="hidden w-64 flex-col border-r border-zinc-800 bg-zinc-950/80 p-6 md:flex">
      <div className="mb-8 flex items-center gap-3 text-lg font-semibold text-white">
        <span className="rounded-full bg-purple-500/20 p-2 text-purple-300"><Headphones className="h-5 w-5" /></span>
        VOID
      </div>
      <nav className="space-y-2">
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href as never} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-white">
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
