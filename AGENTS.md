<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Roles live in `public.user_roles` (never on profiles); RLS uses security-definer helpers (`is_group_member`, `is_class_student`, and ownership-scoped `teaches_class`/`teaches_group`/`teaches_student`) to avoid recursive policies. Teacher policies must use the ownership helpers, never bare `is_teacher()`, because several teachers share the database.
- Teacher role is granted only by consuming a one-time `teacher_invites` code (signup metadata via `handle_new_user`, or the `redeem_teacher_invite` RPC), so nobody can self-promote.
- Project stages are a flat ordered list in `src/lib/phases.ts` (1–3 planning, 4–12 written-project parts, 13 banner), each tagged with its bimestre; every screen and the lateness math iterate that list, never a hard-coded count. Delivery rules live in `src/lib/phase-rules.ts` (pure, unit-tested) for the UI and are mirrored in SQL `phase_rule_problem` inside `submit_phase`, so keep both in sync. ABNT citation detection is `src/lib/citations.ts` (strict, unit-tested); SQL `has_author_date_citation` is a deliberately looser mirror so anything the UI accepts also passes. The Referências cross-check (every work cited in Introdução/Resultados needs a reference line with the same year and an author word) is `referenceCheck` in the UI and SQL `first_missing_reference` in `phase_rule_problem`; the SQL uses every word of the author part, so it is never stricter than the UI.
- Group joining, group creation and phase delivery go through security-definer RPCs (`create_group`, `join_group`, `submit_phase`) so students cannot bypass the 3-member limit or skip phases.
- Students cannot change `projects.current_phase` directly; a trigger blocks it except inside `submit_phase` or for the teacher.
- Client reads use the browser Supabase client with RLS via `src/lib/queries.ts` queryOptions; routes load with `ensureQueryData` and render with `useSuspenseQuery`.
- Late-penalty math lives in `src/lib/penalty.ts` (pure, unit-tested) so teacher and student screens show the same numbers.
- AI phase evaluation returns per-criterion scores via a strict schema; the overall grade is computed in `src/lib/ai-score.ts` (pure, unit-tested), never taken from the model. Results are saved to `ai_evaluations` only by the server function (admin insert after a membership check; no client insert policy) so students cannot forge scores. Students have no SELECT on `ai_evaluations`; they read score-free suggestions through the `group_ai_suggestions` RPC, and the server function returns no scores.
- The teacher's all-students list (`src/lib/roster.ts`, pure, unit-tested) reuses `projectLateness`, so a student's lateness equals their group's.
- Grades are per bimestre (DB column keeps the legacy name `trimester`, values 1–4). A stage's late penalty comes off only its own bimestre via `bimesterPenalties` in `src/lib/penalty.ts`; the bimestre report (`src/lib/bimester.ts`, pure, unit-tested) and per-student review both use it; students see only their own group's grades because `grades` RLS is group-scoped.
- Banner files live in the private `banners` bucket at `<group_id>/<file>`; storage RLS lets members write only until the banner stage is delivered, and `submit_phase` checks the file exists. Files open through short-lived signed URLs.
- Per-student review math (final bimestre grade = teacher score − that bimestre's late penalty, AI/peer averages) lives in `src/lib/student-review.ts` (pure, unit-tested); the screen only renders it.
- The banner template per class (Canva link, size, sections, guidance) lives on `classes`; `bannerBrief` in `src/lib/banner.ts` (pure, unit-tested) fills defaults so the teacher's preview and the student's banner stage render the same brief.
- The grades/feedback spreadsheet is built in the browser: rows come from `buildExport` in `src/lib/export-rows.ts` (pure, unit-tested, reusing `bimesterPenalties`), and `src/lib/export-xlsx.ts` lazy-loads ExcelJS so the library never enters other pages; the Total column is a live formula.
