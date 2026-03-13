## Design Context

### Users

Community members joining spaces to chat — similar mental model to Discord servers. They're not Matrix protocol enthusiasts; they just want a fast, reliable chat app that gets out of the way. Typical context: daily communication within interest-based or project-based communities.

### Brand Personality

**Clean, fast, minimal.** The interface should feel efficient and invisible — the content (conversations, people) is the star, not the chrome. Harmony's identity comes from speed and polish, not visual noise.

Maximizing customizability is a core value — users should be able to make the app feel like theirs.

### Aesthetic Direction

- **Tone**: Utilitarian minimalism with warmth. Clean surfaces, purposeful spacing, no visual noise.
- **Theme**: Light and dark modes are equally important. Both must feel intentional and polished.
- **Design system**: Skeleton Labs (Cerberus active, Mona and Vox available). Leverage Skeleton's token system for theming and customizability.
- **Anti-references**: Not a Discord clone (own visual identity). Not corporate SaaS (Slack/Teams). Not hacker/terminal aesthetic (Element). Not overly playful or toy-like. Harmony should feel like a tool that respects your time.

### Accessibility

- Target WCAG AAA for everything except contrast ratios (AA minimum for contrast).
- Keyboard navigation, screen reader support, focus management, and ARIA roles are high priority.
- Respect reduced motion preferences.

### Design Principles

1. **Invisible until needed.** The UI should disappear — minimize chrome, maximize content. Show controls contextually, not all at once.
2. **Speed is a feature.** Every interaction should feel instant. Optimistic UI, no unnecessary loading states, minimal layout shift.
3. **Make it theirs.** Design for customizability. Use tokens and themes so users can reshape the experience. Don't hard-code aesthetic choices that should be configurable.
4. **Accessible by default.** Accessibility isn't a separate workstream — it's baked into every component. WCAG AAA (AA for contrast).
5. **Earn every pixel.** No decorative elements without purpose. No redundant information. Every visual choice should solve a problem or communicate something.
