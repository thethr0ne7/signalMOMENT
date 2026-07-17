# signalMOMENT design foundation

This is a product constraint, not a component-library project.

## Core rule

**Behavior and appearance stay independent.**

Gameplay, scoring, routing, analytics and Telegram integration must not depend on CSS class names, visual themes or animation choices. Visual components consume state; they do not define game rules.

## Token layers

1. **Brand tokens** describe the visual identity: mint, violet, cyan, danger.
2. **Semantic tokens** describe intent: canvas, surface, primary text, muted text, focus, line.
3. **Component styles** consume semantic tokens.

New UI should prefer semantic tokens such as `--color-text-secondary` instead of copying raw rgba or hex values.

## Component API rules

- Use props that describe state or intent: `status="danger"`, not `red=true`.
- Keep game calculations outside presentational components.
- Do not create a generic component until the same behavior appears at least twice.
- A component must define loading, empty, disabled and error behavior when those states are possible.
- Interactive elements must use native controls whenever possible.

## Motion rules

Motion must do at least one job:

- explain causality;
- signal a state transition;
- direct attention to an urgent event;
- provide tactile feedback to an action.

Decorative looping motion must stop for `prefers-reduced-motion` and must never delay the primary action.

## Accessibility baseline

- Minimum interactive target: 44×44 CSS pixels.
- Visible keyboard focus.
- Accessible name for every control.
- Color is never the only carrier of meaning.
- Important dynamic status uses `aria-live` sparingly.
- The game remains understandable without sound or haptics.

## Review loop

```text
Feature
→ Build
→ Product Review
→ UI / Component Review
→ Motion / Interaction Review
→ Accessibility Review
→ Performance Review
→ Fix
→ Merge
```

The pull-request template is the enforcement point. A checked box without evidence is not a passed gate.
