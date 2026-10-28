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
- Roles live in `public.user_roles` (never on profiles); RLS uses security-definer helpers (`is_teacher`, `is_group_member`, `is_class_student`) to avoid recursive policies.
- Group joining, group creation and phase delivery go through security-definer RPCs (`create_group`, `join_group`, `submit_phase`) so students cannot bypass the 3-member limit or skip phases.
- Students cannot change `projects.current_phase` directly; a trigger blocks it except inside `submit_phase` or for the teacher.
- Client reads use the browser Supabase client with RLS via `src/lib/queries.ts` queryOptions; routes load with `ensureQueryData` and render with `useSuspenseQuery`.
- Late-penalty math lives in `src/lib/penalty.ts` (pure, unit-tested) so teacher and student screens show the same numbers.
- AI phase evaluation returns per-criterion scores via a strict schema; the overall grade is computed in `src/lib/ai-score.ts` (pure, unit-tested), never taken from the model. Results are saved to `ai_evaluations` only by the server function (admin insert after a membership check; no client insert policy) so students cannot forge scores.
- Per-student review math (final trimester grade = teacher score − project late penalty, AI/peer averages) lives in `src/lib/student-review.ts` (pure, unit-tested); the screen only renders it.
