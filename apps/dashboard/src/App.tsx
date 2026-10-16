import { useState } from "react";
import { EmptyState } from "./components/EmptyState";
import { EvaluationsTable } from "./components/EvaluationsTable";
import { Login } from "./components/Login";
import { VenueSwitcher } from "./components/VenueSwitcher";
import { useEvaluations } from "./hooks/useEvaluations";
import { useVenues } from "./hooks/useVenues";
import { getEurobaseClient } from "./lib/eurobase";

export default function App() {
  const [authed, setAuthed] = useState(() => getEurobaseClient().auth.getSession() !== null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const { venues, loading: venuesLoading, error: venuesError } = useVenues(authed);
  const { evaluations, loading: evalsLoading, error: evalsError } = useEvaluations(
    authed ? selectedVenueId : null,
  );

  if (!authed) {
    return <Login onAuthed={() => setAuthed(true)} />;
  }

  const selectedVenue = venues.find((v) => v.id === selectedVenueId);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Agien</span>
        <button
          type="button"
          className="signout"
          onClick={() => {
            void getEurobaseClient().auth.signOut();
            setAuthed(false);
            setSelectedVenueId(null);
          }}
        >
          Sign out
        </button>
      </header>

      {venuesError && <p className="err">Could not load venues: {venuesError}</p>}
      {venuesLoading && venues.length === 0 && <p className="muted">Loading venues…</p>}
      {venues.length > 0 && (
        <VenueSwitcher
          venues={venues}
          selectedId={selectedVenueId}
          onSelect={setSelectedVenueId}
        />
      )}

      {selectedVenueId && (
        <main>
          <h2>Evaluations — {selectedVenue?.name ?? selectedVenueId}</h2>
          {evalsError && <p className="err">Could not load evaluations: {evalsError}</p>}
          {evalsLoading && evaluations.length === 0 && <p className="muted">Loading…</p>}
          {!evalsLoading && evaluations.length === 0 && (
            <EmptyState venueName={selectedVenue?.name ?? ""} />
          )}
          {evaluations.length > 0 && <EvaluationsTable rows={evaluations} />}
        </main>
      )}
    </div>
  );
}
