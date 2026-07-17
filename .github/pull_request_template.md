## Outcome

<!-- What user or product outcome does this change improve? -->

## Evidence

<!-- Screenshots, recording, test output, or measured behavior. -->

## Quality gates

- [ ] TypeScript passes
- [ ] Scoring tests pass
- [ ] Production build passes
- [ ] No regression in local Telegram fallback

## Product review

- [ ] The change solves a user problem, not only a visual preference
- [ ] The primary action is obvious within three seconds
- [ ] Empty, loading, error and interrupted states are handled
- [ ] Analytics events exist for any new critical funnel step

## UI and component review

- [ ] Existing semantic tokens are used before adding raw values
- [ ] Behavior is not coupled to appearance
- [ ] Components have a clear API and no duplicated interaction logic
- [ ] Content remains readable on narrow Telegram viewports

## Motion and interaction review

- [ ] Motion communicates state or causality
- [ ] No animation delays the primary action
- [ ] Touch targets are at least 44×44 CSS pixels
- [ ] Pointer, keyboard and interrupted-app behavior were checked
- [ ] Reduced-motion behavior remains usable

## Accessibility review

- [ ] Interactive controls have accessible names
- [ ] Keyboard focus is visible
- [ ] Status changes are announced only when useful
- [ ] Meaning is not communicated by color alone
- [ ] Contrast was checked for primary text and actions

## Performance review

- [ ] No avoidable React updates were added to the animation loop
- [ ] No new render-blocking dependency was introduced without evidence
- [ ] Canvas and motion remain usable on a lower-end mobile device

## Review verdict

- [ ] SHIP — evidence and gates are sufficient
- [ ] FIX — specific issues are listed in review comments
