# Mobile empty-state review

Reviewed 11 September 2026. Scope: mobile Home, Today, Gallery and the supporting empty-state/join components. Home was visually inspected in the running iPhone 17 Pro simulator in light mode; other findings come from source review. No app code changed. Brand reference: mobile/.impeccable.md.

## Verdict

The composition feels like repeated onboarding promotion: a large stock travel photo, small glass action, and three colored feature rows. The image itself suits travel and the native glass shell is intentional. The problem is emphasis: the interface gives features more attention than the traveller's next step. Home's lower half is largely unoccupied, while the useful content feels bundled into a promotional block at the top.

## Priority findings

1. **P1 — Primary action is undersized and visually secondary.** `mobile/components/ui/JoinTripNote.tsx:101` renders Join a trip as a 38pt-high glass pill without hitSlop. This misses the project's 44pt target. The Home render confirms that the photo and feature card dominate it. Use a solid teal action with a minimum height of 44pt (48pt is a reasonable implementation choice), allowing expansion with text size. Suggested command: /adapt, then /polish.
2. **P2 — Instructions arrive too late.** `mobile/app/(tabs)/index.tsx:1323` says “Your next trip starts here” and lists cover photos/countdowns/dates. The actionable organizer-code explanation appears only inside the join sheet at line 576. Explain the code or invite prerequisite beside the first action. Suggested copy: “Join your trip” / “Use the code or invite link from your organiser to see your itinerary and trip details.” Keep Join a trip as the action because the sheet supports several entry methods. Suggested command: /clarify.
3. **P2 — Three tabs repeat the same promotional layout.** Home at line 1323, Today (`destinations.tsx:559`) and Gallery (`media/index.tsx:1126`) use the same hardcoded image and feature list. Reserve a welcome treatment for Home; use each other tab's normal heading and a compact contextual message. For example: Today — “Your daily plan will appear here when you join a trip.” Gallery — “Join a trip to see and share the group's photos.” Suggested command: /distill.
4. **P2 — Decorative colors weaken category meaning.** Gallery assigns the flight tone to notifications and hotel tone to sharing (`media/index.tsx:1131`). These colors ordinarily identify actual event categories. Remove the feature tour, or use neutral supporting icons. Suggested command: /distill.
5. **P2 — Offline emptiness is handled inconsistently.** Home explicitly branches on offline at `index.tsx:1316`; Today only checks `!displayTrip` (`destinations.tsx:552`), and Gallery checks `trips.length === 0` (`media/index.tsx:1125`). With no cached trips and no connection, these tabs invite the user to join even though the app cannot establish that they have no trips. Use a consistent distinction between unavailable data and a confirmed empty account. This is a source-confirmed branch discrepancy; no network outage was simulated. Suggested command: /clarify for state messaging, with corresponding state-logic correction.

## Audit health score

Provisional implementation review, not accessibility certification or measured performance testing.

| Dimension | /4 | Evidence / limitation |
|---|---:|---|
| Accessibility | 2 | Main action misses project touch-target requirement; screen reader and enlarged-text testing outstanding |
| Performance | 3 | Local 176KB image, small static feature list; mask/gradient rendering not profiled |
| Responsive design | 2 | Fixed 280pt hero, two-line capped heading, fixed 38pt button; enlarged-text fit needs device verification |
| Theming | 3 | Shared light/dark tokens; only light Home visually verified |
| Anti-patterns | 2 | Repeated centered photo/action/feature-list composition; decorative category colors |
| Total | 12/20 | Significant work needed in action hierarchy and state handling |

Five prioritized findings: P0 0, P1 1, P2 4, P3 0. Fixed-height text clipping and photo contrast remain test risks, not confirmed failures.

## Design health score

Provisional heuristic assessment of empty-state-to-join scope; join flow was inspected in source, not completed on a device.

| Heuristic | /4 | Key observation |
|---|---:|---|
| System status | 2 | Offline distinction differs between tabs |
| Real-world language | 3 | Plain language, but introductory content is feature-focused |
| User control | 3 | Join sheet includes cancellation |
| Consistency | 2 | Different empty-state layouts and status behavior |
| Error prevention | 3 | Trip preview before joining |
| Recognition | 3 | Join is labeled; prerequisites are deferred |
| Efficiency | 3 | PIN/link/QR options in join sheet |
| Minimalist design | 2 | Feature tour overwhelms the useful next step |
| Error recovery | 3 | Join error copy exists; full runtime recovery untested |
| Help | 2 | Organizer guidance should appear earlier |
| Total | 26/40 | Direction is usable but needs clearer priorities |

Cognitive load is moderate: the issue is focus and hierarchy, not an excessive number of choices. A first-time traveller needs organizer guidance sooner. A one-handed traveller needs a larger primary target. A traveller without a connection needs a truthful unavailable-data state.

## Keep

- Destination photography can provide anticipation; retain it selectively on Home.
- Native navigation, plain-spoken text, and shared theme tokens are a useful foundation.
- Gallery correctly distinguishes no photos from no matching media and offers Add photos or Show everything.
- The join sheet already contains useful organizer guidance, entry alternatives, and a trip preview. Improve its entry point before redesigning the whole flow.

## Recommended sequence

1. /clarify — Explain the organizer code/invite immediately and distinguish offline from no trips.
2. /distill — Remove repeated feature tours; one welcome on Home, contextual empty states on Today/Gallery.
3. /adapt — Enlarge the action and verify enlarged text, small devices, and both themes.
4. /polish — Refine spacing, hero balance and primary-action emphasis.

These can be addressed together or separately. Re-run /audit and /critique after changes.

## Verification limits

No application changes or builds were necessary for this review. Native visual inspection covered light-mode Home only. Dark mode, VoiceOver, Dynamic Type, smaller devices and offline transitions still need runtime verification. The optional Impeccable CLI was absent locally; a no-install invocation did not return results and was stopped. No deterministic-detector findings or browser overlays are claimed. Findings above were checked directly against source, with Home hierarchy additionally checked against the native render.
