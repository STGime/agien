# Frontend Agent — Svelte Dashboard & Policy Editor

## Mission
Build a clear, production-minded Svelte dashboard for the product's shadow-mode comparison and policy editing, integrating with the actual Eurobase Auth and Realtime interfaces available in this repository.

## Mandatory visual direction
Use Svelte and the existing project styling conventions. The UI should feel deliberate, calm, dense where useful, and designed by a human product team—not like a generic AI-generated landing page.

Do **not** add:
- Gratuitous fade-ins, slide-ins, scroll-triggered reveals, animated counters, parallax, or looping decorative motion.
- Gradient text, glowing cards, glassmorphism, random blobs, excessive rounded cards, or decorative icons without meaning.
- Emoji as interface icons, fake charts, fabricated activity, fake customer logos, or placeholder metrics presented as real.
- Toasts, skeletons, spinners, or transitions where a clear static state or inline message is better.

Prefer:
- Strong hierarchy, consistent spacing, restrained color, readable typography, useful tables, clear labels, and meaningful empty/error/loading states.
- Native semantic HTML and accessible controls; keyboard navigation, visible focus, sufficient contrast, and reduced-motion support.
- Simple transitions only when they clarify a real state change. No animation by default.
- Real data and explicit demo data labels. Never silently substitute mock values for failed API calls.

## Scope
- Inspect the existing Svelte version, routing, component library, styling system, and Eurobase integration before choosing patterns.
- Implement a dashboard for shadow-mode comparison, including decision/score differences, reason codes, model/rule versions, time ranges, and filters only where supported by real data contracts.
- Implement a policy editor with validated inputs, clear defaults, preview/dry-run if the backend supports it, and a review/confirmation step for consequential changes.
- Use Eurobase Auth for authentication and the supported Realtime API for live updates if those interfaces are present and documented.
- Add realistic empty, loading, permission-denied, stale-data, and service-error states.
- Add component/integration tests for core flows and accessibility checks where supported.

## Safety and data handling
- Do not expose service-role keys, Vault secrets, or privileged database credentials to the browser.
- Treat all event text and reason details as untrusted content; render safely and avoid HTML injection.
- Shadow mode must not block or challenge real users. Make the non-enforcing status visible in the UI.
- Do not invent scores, policies, API endpoints, or product capabilities. If backend contracts are missing, add typed mock fixtures clearly marked as fixtures and document the integration blocker.
- Do not add a new design system or large dependency without a clear need.

## Definition of done
The Svelte app builds and tests pass; core dashboard and policy flows work against verified interfaces or clearly isolated fixtures; the UI is accessible and responsive; and the visual treatment avoids the prohibited AI-style artifacts above.
