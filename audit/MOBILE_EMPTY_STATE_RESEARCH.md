# Dalefy mobile: empty-state design research

11 September 2026. Focus: the traveller's experience before joining a trip. This research builds on mobile/.impeccable.md and the light-mode Home render inspected in the simulator. It proposes direction, without changing application code.

## Research conclusion

Design the empty screen as the first useful state of the traveller companion. Its purpose is to help someone access the trip their organiser has prepared. Dalefy's character can come from its photography, typography, agency identity and precise interaction details. Filling the screen with feature descriptions does not establish that character.

My earlier suggestion to remove the feature list and strengthen the button was incomplete. Those changes improve hierarchy, but the design still needs an intentional relationship between its empty and populated states.

## Relevant references and what they actually establish

| Reference | Evidence | Application to Dalefy |
|---|---|---|
| [Flighty: Apple's designer interview](https://developer.apple.com/news/?id=970ncww4) | The team grounds its information design in airport signage, prioritises immediate comprehension, plans for connectivity loss and explores many concepts before selecting one. | Derive character from travel and the job being performed. Preserve clear structure when the account has no content. Use the interview as a design-process reference, not proof of Flighty's current empty screen. |
| [Travefy traveller app](https://travefy.com/traveler-app) | Its documented flow starts with the travel planner's invitation, then opens the itinerary in the app. | Closest functional reference: the traveller is accessing an organised trip. The entry screen should acknowledge the organiser and invitation. |
| [Travefy mobile best practices](https://intercom.help/travefy/en/articles/2938258-mobile-app-best-practice-tips-for-you-and-your-clients) | Travefy explicitly recommends starting from the web itinerary rather than downloading the app first. It documents confusion around a legacy invite-code option. | Judge the full invite-to-trip journey. Dalefy should handle both direct app launch and arriving from an invitation deliberately. This is a research implication, not a claim that Dalefy's deep links are broken. |
| [Apple onboarding guidance](https://developer.apple.com/design/human-interface-guidelines/onboarding) | Recommends brief onboarding, learning through interaction and instructions near the relevant task. | Let joining the trip do the teaching. Keep guidance beside the join control, with deeper help disclosed only when needed. |
| [Apple: Writing for interfaces](https://developer.apple.com/videos/play/wwdc2022/10037/) | Uses saved Podcasts as an example of explaining both the absence of content and how it will appear. Empty-state tone should fit its context. | Give each tab a specific explanation. A quiet day, an empty gallery and no joined trip have different meanings. |
| [NN/g: Designing empty states](https://www.nngroup.com/articles/empty-state-interface-design/) | Identifies status, learning cues and direct paths to tasks as the core jobs of empty states; warns about misleading absence messages during loading. | Treat first use, loading, offline and empty results as distinct states. Visual polish cannot compensate for the wrong explanation. |

These sources support interaction principles and product-fit reasoning. They do not establish that one exact layout or palette will perform best for Dalefy.

## Visual reference leads

[Flighty screenshot archive on Uiland](https://uiland.design/screens/flighty/screens/9e854914-f56e-488e-9a8d-3961c875e31f) and [Flighty on Refero](https://refero.design/apps/49) surface examples labelled My Flights with an add-flight search control and map context. These are useful leads for studying continuity between an empty collection and its populated interface. They are third-party captures, may represent different versions, and their full-resolution image fetches failed during this research. I have not treated them as verified current app behaviour or made pixel-level claims from them.

The current Dalefy Home screenshot was directly inspected. It has an atmospheric airplane-wing photo, centred welcome text, a small glass join control, a three-row feature card, and substantial open space below. The photograph and native navigation are compatible with the mobile brief. The composition feels assembled because the feature card occupies the main content region without doing the work that content region normally performs.

## Three directions worth comparing

### A. Trip access in the existing Home structure — preferred

Keep the real Home shell and organise the empty content where the traveller will later see their trip. Retain a restrained photographic opening if it works with the populated Home composition. Put a single, clearly grouped access section on the page: heading, organiser guidance, primary action and a quiet help disclosure. Avoid adding an extra card solely to contain these four elements.

Suggested hierarchy:

- Existing agency/app identity and navigation.
- “Join your trip” as the task heading; a personalised greeting can remain subordinate.
- “Use the code or invite link from your organiser to get your itinerary and trip details.”
- “Join a trip” opening the existing PIN/link/QR sheet.
- “Where do I find my code?” revealing a short explanation to check the organiser's message or ask them for an invitation.

Keep the existing SF UI type, limited Barlow display use, spacing scale and teal action treatment. The primary control should have a generous target and remain readable when text grows. Align it with the actual Home content margins. Compare the empty and populated screens side by side before deciding photo height or alignment.

Why preferred: strongest fit for an invited traveller and the existing product. Main risk: stripping too much content can make it feel unfinished; solve that through composition and continuity, rather than adding more features.

### B. Editorial welcome on Home

Give Home one deliberate photographic composition with a carefully placed welcome, concise invitation guidance and join action. Remove the feature checklist. Use a photo crop that supports text naturally, with sufficient contrast in both themes. Today and Gallery retain their normal headers and compact contextual empty states.

Why consider it: preserves anticipation and the agency's premium travel character. Main risk: a full promotional hero can continue to feel detached from the working app. This direction needs a considered photograph, typography and transition to the joined state; changing only the CTA will not resolve it.

### C. Direct code entry on Home

Expose the primary code-entry interaction in the Home content area, with link/QR alternatives disclosed nearby. This puts the prerequisite immediately within reach.

Why consider it: strongest task immediacy for travellers with a code. Main risk: keyboard, validation and multiple invitation methods complicate the first screen and duplicate the existing sheet. Only prefer this after confirming that code entry is the dominant real arrival path.

These are hypotheses to compare, not research-proven winners. A is the best starting point from the available product context; B is worth retaining as the more expressive alternative.

## A coherent empty-state family

| State | What the screen should communicate | Appropriate action |
|---|---|---|
| Home, no trip | How to access the organiser's trip | Join a trip; help finding the invitation |
| Today, no trip | Daily plans become available after joining | Join a trip |
| Gallery, no trip | Photos belong to the joined group trip | Join a trip |
| Joined trip, no photos | The group has not shared photos yet | Add photos, when allowed |
| Joined trip, no events today | There are no scheduled events for this day | View itinerary if useful; no invented task required |
| Data unavailable offline | The app cannot retrieve the trips right now | Recovery guidance; retry where supported |
| Loading | The app is still retrieving content | Progress feedback |
| Filter has no matches | Content may exist outside this filter | Clear or change the filter |

Use shared type, spacing and action rules across these states. Their content and visual weight should vary with the task. There is no need to force every state into the same icon/title/button template.

## What makes the result feel authored

- Continuity: Home looks like the same place before and after joining.
- Specificity: references to the organiser, trip and actual arrival method earn their place.
- Meaningful imagery: photography creates anticipation on Home; it does not repeat as filler on every tab.
- Semantic colour: event-category colours continue to identify events. Teal identifies action and selection.
- Resolved composition: whitespace, photo crop and text position work as a whole at real device size.
- Behaviour: opening an invitation, cancelling entry, receiving an invalid code and losing connection are as considered as the first screenshot.

Rounded corners, system fonts, photography and native glass are not evidence that an app is AI-generated. A generic appearance comes from context-free combinations and unresolved decisions. Dalefy's mobile brief intentionally uses several of those materials; preserve their purpose.

## Next design step

Compare two static compositions of A and B against the populated Home screen, using actual Dalefy typography, colours and navigation. Include Today and Gallery alongside them so the whole family can be judged. Review light and dark themes and enlarged text before implementation. The comparison should answer: is the next step obvious, does this feel like Dalefy, and does the empty state belong to the same product as the joined trip?

Research limitation: desk research plus one directly inspected native screen, not a usability study. Competitor flows were researched from public documentation rather than completed in their live apps. No claim is made that users prefer a particular concept until it is tested.
