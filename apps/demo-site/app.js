// Demo booking page logic (no framework). Talks to the local proxy server
// (make demo-up), which forwards /api/* to the deployed Eurobase functions.

let sessionToken = null;

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: resp.status, body: await resp.json().catch(() => ({})) };
}

function setStatus(msg, kind) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = kind || "";
}

function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function mintSession() {
  const { status, body } = await postJson("/api/session", {});
  if (status === 200 && body.session_token) {
    sessionToken = body.session_token;
  } else {
    setStatus("Could not start a session. Please reload.", "error");
  }
}

function renderSlots(slots) {
  const container = document.getElementById("slots");
  container.textContent = "";
  if (slots.length === 0) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No tables for this date.";
    container.appendChild(p);
    return;
  }
  for (const slot of slots) {
    const label = document.createElement("label");
    label.className = "slot" + (slot.available ? "" : " disabled");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "slot";
    input.value = slot.id;
    input.disabled = !slot.available;
    if (slot.is_hot) {
      const badge = document.createElement("span");
      badge.className = "hot-badge";
      badge.textContent = "★ ";
      label.appendChild(badge);
    }
    label.appendChild(document.createTextNode(slot.start_time));
    label.appendChild(input);
    container.appendChild(label);
  }
}

async function loadSlots(date) {
  const resp = await fetch(`/api/slots?date=${encodeURIComponent(date)}`);
  const body = await resp.json().catch(() => ({ slots: [] }));
  renderSlots(body.slots || []);
}

async function submitBooking(ev) {
  ev.preventDefault();
  setStatus("");
  if (!sessionToken) {
    setStatus("Session not ready — reloading.", "error");
    return mintSession();
  }
  const form = document.getElementById("booking-form");
  const selected = form.querySelector('input[name="slot"]:checked');
  if (!selected) {
    setStatus("Please choose a time.", "error");
    return;
  }
  const body = {
    session_token: sessionToken,
    slot_id: selected.value,
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value || undefined,
    notes: document.getElementById("notes").value || undefined,
    party_size: Number(document.getElementById("party_size").value),
  };
  const { status, body: respBody } = await postJson("/api/book", body);
  if (status === 200) {
    setStatus("Booked! Your table is reserved.", "ok");
    document.getElementById("submit").disabled = true;
    loadSlots(document.getElementById("date").value);
  } else {
    const msg = respBody?.error?.message || "Booking failed.";
    setStatus(msg, "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const dateEl = document.getElementById("date");
  dateEl.value = todayIso();
  dateEl.min = todayIso();
  dateEl.addEventListener("change", () => loadSlots(dateEl.value));
  document.getElementById("booking-form").addEventListener("submit", submitBooking);
  mintSession().then(() => loadSlots(dateEl.value));
});
