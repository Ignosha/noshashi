# canvas-fonts was removed from this copy

The upstream skill ships ~5.5 MB of TTFs for its canvas poster/social-image
generator. Nothing in this repository uses that generator, and NOSHASHI's
font policy is deliberate and measured: two self-hosted faces, 136 KB total,
no CDN in the CSP (DESIGN.md, "Typography"). That document explicitly counts
"616 KB of fonts nothing referenced" as dead weight that was removed.

Carrying 5.5 MB of unreferenced fonts to keep a feature this project will
never call would contradict the thing the design system is proud of.

To restore, if the canvas generator is ever wanted:

    git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill /tmp/uiux
    cp -r /tmp/uiux/.claude/skills/ui-styling/canvas-fonts \
          .claude/skills/uiux-pro-max-ui-styling/canvas-fonts

Everything else in the skill — SKILL.md, references/, scripts/ — is intact.
