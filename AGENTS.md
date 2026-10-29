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
- Roles live in `public.user_roles`; RLS uses security-definer helpers (`is_group_member`, `is_class_student`, ownership-scoped `teaches_class`/`teaches_group`/`teaches_student`). Teacher policies use the ownership helpers, never bare `is_teacher()`, because several teachers share the database.
- Teacher role comes only from consuming a one-time `teacher_invites` code (`handle_new_user` or `redeem_teacher_invite`), so nobody self-promotes.
- Stages are one ordered list in `src/lib/phases.ts` (1–3 planning, 4–12 written parts, 13 banner), each tagged with its bimestre; screens and lateness math iterate it, never a hard-coded count.
- Delivery rules: `src/lib/phase-rules.ts` (pure, tested) mirrored in SQL inside `submit_phase`; keep both in sync. SQL `phase_rule_problem` is a thin wrapper (adds the own-Canva-copy check via `canva_design_id`) over `phase_rule_problem_base`; put per-stage rules in the base. ABNT citations: strict `src/lib/citations.ts`, looser SQL `has_author_date_citation`; reference cross-check `referenceCheck` / SQL `first_missing_reference` (never stricter than the UI).
- Group create/join and phase delivery go through security-definer RPCs (`create_group`, `join_group`, `submit_phase`) so the 3-member limit and stage order hold; a trigger blocks students changing `projects.current_phase`.
- Client reads use the browser client with RLS via `src/lib/queries.ts` queryOptions (`ensureQueryData` + `useSuspenseQuery`).
- Pure, unit-tested math modules shared by teacher and student screens: `penalty.ts` (`bimesterPenalties`: a stage's late penalty hits only its bimestre), `bimester.ts`, `roster.ts` (reuses `projectLateness`), `student-review.ts`, `ai-score.ts`, `banner.ts` (`bannerBrief`, `bannerProgress`), `project-code.ts`. Grades column keeps legacy name `trimester` (values 1–4 = bimestres).
- AI evaluation: strict per-criterion schema, overall computed in `ai-score.ts`, saved to `ai_evaluations` only by the server function via admin after a membership check. Students have no SELECT there; they read score-free tips via `group_ai_suggestions`.
- Banner files: private `banners` bucket at `<group_id>/<file>`, member writes only until stage 13 is delivered, signed URLs to open. Copies go to the Google Drive connector account (`banner-drive.server.ts`, folders tagged by `appProperties`, last copy in admin-written `banner_drive_files`) only for classes whose teacher e-mail equals that Google account.
- Project code AREA-CLASSLABEL-NN is built only by `projectCode`: `area_code` (students set only while empty; guarded in `guard_project_update`), `classes.code_label`, and `projects.code_number` — one count per teacher, assigned on insert by trigger and reassigned only by `renumber_projects` (class order in `classes.code_order`, mirrored by `numberProjects`). `project_seq` is deprecated.
- Spreadsheet (`export-rows.ts` → ExcelJS) and ABNT Word for the full project and the plan (`abnt-doc.ts` → `docx`) exports build in the browser from pure tested models and lazy-load their libraries so other pages stay light.
- Fair countdown date/name live on `classes.fair_at`/`fair_name`; the teacher sets them for all her classes at once and new classes inherit them via trigger, so students read it through their class with existing RLS.
- Per-student grade adjustments live in `student_grade_adjustments` (teacher-only writes, student reads own); every final bimestre grade goes through `finalGrade` in `penalty.ts` (group grade − bimestre penalty + adjustment, 0–10) so screens and exports agree.
- WhatsApp reminders: pure recipient logic in `reminders.ts` (tested); sending/status in `whatsapp.server.ts` via the connector gateway using one approved Meta template; outbound rows in `whatsapp_messages` (admin-written), verified callbacks stored first in `whatsapp_webhook_events` and applied by `apply_whatsapp_status` (never moves backwards). Only accounts in `WHATSAPP_OWNER_EMAILS` may send, because the connected number is one teacher's own. A daily managed cron hits `/api/public/jobs/whatsapp-reminders`, which honors each teacher's `whatsapp_settings` interval.
