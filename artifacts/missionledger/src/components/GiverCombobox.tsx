import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, UserPlus } from "lucide-react";
import { authJsonFetch, readJsonSafe } from "@/lib/auth-fetch";

interface Giver {
  id: string;
  name: string;
  email: string | null;
}

interface GiverComboboxProps {
  /** Form field name for the free-text name — kept so existing FormData-based forms need no other changes. */
  nameFieldName: string;
  /** Form field name for the resolved giver id, submitted alongside the name. */
  idFieldName: string;
  defaultName?: string;
  defaultId?: string;
  required?: boolean;
}

/**
 * Search-or-create combobox over the giver directory (/api/donor-directory).
 * Renders two hidden inputs so a plain `new FormData(form)` submit picks up both
 * the free-text name (always set, for backward-compatible reporting) and the
 * resolved donorId (set once a match is selected or a new giver is created).
 */
export function GiverCombobox({ nameFieldName, idFieldName, defaultName, defaultId, required }: GiverComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultName ?? "");
  const [selectedId, setSelectedId] = useState(defaultId ?? "");
  const [results, setResults] = useState<Giver[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await authJsonFetch(`/api/donor-directory?search=${encodeURIComponent(query)}`);
        const data = res.ok ? await readJsonSafe<Giver[]>(res) : [];
        setResults(data ?? []);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  function handleSelectExisting(g: Giver) {
    setQuery(g.name);
    setSelectedId(g.id);
    setOpen(false);
  }

  async function handleCreateNew(name: string) {
    setOpen(false);
    const res = await authJsonFetch(`/api/donor-directory/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const created = await readJsonSafe<Giver>(res);
      if (created) {
        setQuery(created.name);
        setSelectedId(created.id);
        return;
      }
    }
    // Resolve failed — keep the typed name so the pledge/donation can still be
    // saved (donorId just stays unlinked, same as before this feature existed).
    setQuery(name);
    setSelectedId("");
  }

  const trimmed = query.trim();
  const exactMatch = results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <>
      <input type="hidden" name={nameFieldName} value={query} required={required} />
      <input type="hidden" name={idFieldName} value={selectedId} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            <span className="truncate">{query || "Search or add a giver..."}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Type a name..."
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                setSelectedId(""); // typing invalidates a prior exact selection
              }}
            />
            <CommandList>
              {loading && <div className="py-6 text-center text-sm text-muted-foreground">Searching...</div>}
              {!loading && results.length === 0 && <CommandEmpty>No matches.</CommandEmpty>}
              <CommandGroup>
                {results.map((g) => (
                  <CommandItem key={g.id} value={g.id} onSelect={() => handleSelectExisting(g)}>
                    <div>
                      <div>{g.name}</div>
                      {g.email && <div className="text-xs text-muted-foreground">{g.email}</div>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              {trimmed && !exactMatch && (
                <CommandGroup>
                  <CommandItem onSelect={() => handleCreateNew(trimmed)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add "{trimmed}" as a new giver
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
