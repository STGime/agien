export function EmptyState({ venueName }: { venueName: string }) {
  const curl = `curl -sS https://newtek.eurobase.app/v1/functions/evaluate \\
  -H "apikey: $EUROBASE_API_KEY" \\
  -H "x-api-key: <venue-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"venue_id":"<uuid>","request":{"ip":"203.0.113.7","user_agent":"Mozilla/5.0"},"booking":{"cancellation_policy":"card_hold"}}'`;

  const snippet = `Agien.init({
  venueId: "${venueName}",
  endpoint: "https://newtek.eurobase.app/v1/functions/beacon",
  form: document.getElementById("booking-form"),
});`;

  return (
    <section className="empty" aria-label="No evaluations yet">
      <h2>No evaluations yet</h2>
      <p>
        Evaluations for {venueName} will appear here as bookings arrive. Wire up
        the beacon, or send an evaluation with curl:
      </p>
      <h3>Beacon snippet</h3>
      <pre>
        <code>{snippet}</code>
      </pre>
      <h3>curl example</h3>
      <pre>
        <code>{curl}</code>
      </pre>
    </section>
  );
}
