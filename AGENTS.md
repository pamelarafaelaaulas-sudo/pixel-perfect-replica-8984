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
- Project stages are a flat ordered list in `src/lib/phases.ts` (1–3 planning, 4–12 written-project parts); every screen and the lateness math iterate that list, never a hard-coded count. Delivery rules live in `src/lib/phase-rules.ts` (pure, unit-tested) for the UI and are mirrored in SQL `phase_rule_problem` inside `submit_phase`, so keep both in sync. ABNT citation detection is `src/lib/citations.ts` (strict, unit-tested); SQL `has_author_date_citation` is a deliberately looser mirror so anything the UI accepts also passes.
- Group joining, group creation and phase delivery go through security-definer RPCs (`create_group`, `join_group`, `submit_phase`) so students cannot bypass the 3-member limit or skip phases.
- Students cannot change `projects.current_phase` directly; a trigger blocks it except inside `submit_phase` or for the teacher.
- Client reads use the browser Supabase client with RLS via `src/lib/queries.ts` queryOptions; routes load with `ensureQueryData` and render with `useSuspenseQuery`.
- Late-penalty math lives in `src/lib/penalty.ts` (pure, unit-tested) so teacher and student screens show the same numbers.
- AI phase evaluation returns per-criterion scores via a strict schema; the overall grade is computed in `src/lib/ai-score.ts` (pure, unit-tested), never taken from the model. Results are saved to `ai_evaluations` only by the server function (admin insert after a membership check; no client insert policy) so students cannot forge scores. Students have no SELECT on `ai_evaluations`; they read score-free suggestions through the `group_ai_suggestions` RPC, and the server function returns no scores.
- The teacher's all-students list (`src/lib/roster.ts`, pure, unit-tested) reuses `projectLateness`, so a student's lateness equals their group's.
- Trimester report math (`src/lib/trimester.ts`, pure, unit-tested) uses the same total rule as the per-student review; students see only their own group's grades because `grades` RLS is group-scoped.
- Per-student review math (final trimester grade = teacher score − project late penalty, AI/peer averages) lives in `src/lib/student-review.ts` (pure, unit-tested); the screen only renders it.
