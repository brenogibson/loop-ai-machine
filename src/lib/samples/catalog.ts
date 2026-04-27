export type SampleCategory =
  | "kick"
  | "snare"
  | "hat"
  | "clap"
  | "perc"
  | "bass"
  | "melodic"
  | "fx";

export type SampleMeta = {
  id: string;
  url: string;
  category: SampleCategory;
  vibes: string[];
  bpm_range: [number, number];
  description: string;
  volume_suggest_db: number;
};

export type Catalog = {
  version: number;
  samples: SampleMeta[];
};

export async function fetchCatalog(): Promise<Catalog> {
  const res = await fetch("/catalog.json", { cache: "force-cache" });
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  return (await res.json()) as Catalog;
}

export function sampleMapFrom(catalog: Catalog): Record<string, string> {
  return Object.fromEntries(catalog.samples.map((s) => [s.id, s.url]));
}

export function samplesByCategory(
  catalog: Catalog,
  category: SampleCategory,
): SampleMeta[] {
  return catalog.samples.filter((s) => s.category === category);
}
