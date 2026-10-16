import { useState } from "react";
import { getEurobaseClient } from "../lib/eurobase";

export function Login({ onAuthed }: { onAuthed: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getEurobaseClient().auth.requestMagicLink(email.trim());
    setBusy(false);
    if (error) setError(error);
    else {
      setSent(true);
      onAuthed();
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>Agien</h1>
      <p className="lede">Sign in to see your venues&apos; evaluations.</p>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@venue.com"
      />
      <button type="submit" disabled={busy || email.trim() === ""}>
        {busy ? "Sending…" : "Email me a sign-in link"}
      </button>
      {sent && <p className="ok">Check your inbox — the link is on its way.</p>}
      {error && <p className="err">{error}</p>}
    </form>
  );
}
