import type { Venue } from "../types";

export function VenueSwitcher({
  venues,
  selectedId,
  onSelect,
}: {
  venues: Venue[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="venues" aria-label="Venue">
      {venues.map((v) => (
        <button
          key={v.id}
          type="button"
          className={v.id === selectedId ? "venue active" : "venue"}
          aria-current={v.id === selectedId ? "true" : undefined}
          onClick={() => onSelect(v.id)}
        >
          {v.name}
        </button>
      ))}
    </nav>
  );
}
