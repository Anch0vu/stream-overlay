"use client";

import type { KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@void/ui/components/input";

export function Topbar() {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/90 px-6 py-4 backdrop-blur">
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          defaultValue={params.get("q") ?? ""}
          placeholder="Search tracks, artists, playlists"
          className="pl-9"
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              const value = event.currentTarget.value.trim();
              router.push(value ? `/?q=${encodeURIComponent(value)}` : "/");
            }
          }}
        />
      </div>
    </div>
  );
}
