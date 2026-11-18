# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Course reviewers for Procedural World Building (instructor and classmates). They open the live site and the docs to judge the technique, the process log and the finished city. Desktop browsers are the context; the work is evaluation, not casual play.

## Product Purpose

Blueprint City is a procedural voxel city grown from a seed by rules, not by hand: ground is printed, streets are paved outward from a plaza, buildings rise story by story, then people, animals and traffic move in. The site exists so a reviewer can watch the rules work (the growth from empty ground to a lived-in island), tune parameters, and inspect agents and buildings. Success is that a reviewer understands which rule produced what they see.

## Positioning

The city is shown as a visible process: a replayable, seeded, tunable growth pipeline (seed, terrain, streets and lots, buildings, life) with technique pages and a development log behind each stage, rather than a finished static diorama.

## Operating Context

- Live at procedural-worlds-d79be.web.app/world (e.g. `/world?seed=blueprint`); `/grammar/simulation` covers building grammar and city simulation.
- Docs in `docs/` (concept, techniques, analysis, plans, tutorial); development log in `site/src/world/README.md`.
- Built as coursework: weekly class notes and studio assignments feed the work.

## Capabilities and Constraints

- Stack is fixed: React 18, Vite, three.js, Tailwind, GSAP, Firebase (hosting and saved configurations). No migration.
- Desktop only for `/world`: no phone-width design or verification.
- American English everywhere (spelling in code, docs and copy).
- Visual direction is already set: compact, terraced voxel island city, rainy rusty cyberpunk, not a skyscraper grid.
- Closed or dropped scopes (do not revive unasked): city controls extras, morphology extras, building grammar presets and toggles, grammar-city lot panel items.

## Brand Commitments

Name: Blueprint City. Reference feel: the miniature voxel-diorama look of *Town to City*, turned toward a neon cyberpunk night.

## Evidence on Hand

Screenshots and banner in `docs/images/`; technique pages in `docs/techniques/`; analysis in `docs/analysis/`; plans in `docs/plans/`. No user testimonials or usage data exist; do not fabricate any.

## Product Principles

1. Show the process: the rules and stages should be legible, not hidden behind a finished picture.
2. The city is the interface; chrome stays out of its way.
3. Everything is seeded and tunable, so results are reproducible and comparable.
4. Documentation is part of the product for reviewers and stays in step with the code.
5. Keep scope compact; drop work rather than leaving stale options in.
