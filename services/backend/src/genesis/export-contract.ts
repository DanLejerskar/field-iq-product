/**
 * Wire contract for the EON Genesis 3.0 procedure export, `format=fieldiq`.
 *
 * Mirrors `GET /api/scenes/:projectId/export?format=fieldiq` as built on the Genesis side
 * (B-27 / G1+G2+G3) and documented in `docs/live/genesis-integration-architecture.md §7.1`.
 * This is an *integration boundary* type — it describes Genesis's JSON, not a Field IQ
 * domain type — so it lives here in the backend rather than in `@field-iq/schema`.
 *
 * Tolerances are deliberate and match the real export captured 2026-06-05 (see
 * `__fixtures__/fieldiq-export-loto.json`): `metadata`, `phase_level`, `camera_config`,
 * `component_id`/`component_label`, and `content_hash` can all be absent/null, and only the
 * rendered steps carry `expected_views`. `content_hash` is bare hex (no `sha256:` prefix).
 */

export interface FieldIqExport {
  /** Export contract version (Genesis emits "3.0"), not the procedure version. */
  version: string;
  procedure: ExportProcedure;
  components: ExportComponent[];
  steps: ExportStep[];
}

export interface ExportProcedure {
  id: string; // procedures.id (Genesis)
  project_id: string; // procedures.project_id (Genesis scoping unit)
  title: string;
  source: string | null;
  difficulty: string | null;
  /** low | medium | high | critical — lives on the procedure, not the step. */
  safety_level: string | null;
  /** Bumps on every Genesis edit; anchors the snapshot version. */
  version: number;
  /** Bare hex sha256 of the canonical step payload; absent on older exports. */
  content_hash?: string | null;
  metadata?: Record<string, unknown> | null;
  total_steps: number;
}

export interface ExportComponent {
  id: string;
  label: string;
  mesh_names: string[];
}

export interface ExportStep {
  step_number: number;
  title: string;
  description: string;
  /** The expected end-state in plain language — becomes `expected_state_text`. */
  expected_outcome: string;
  safety_note: string | null;
  /** Gates escalation; raises the per-step safety level to CRITICAL. */
  critical_step: boolean;
  phase_name: string | null;
  phase_level: string | null;
  interaction_config: ExportInteractionConfig | null;
  component_id: string | null;
  component_label: string | null;
  /** Render pose used to produce the `authored` exemplar; may be null. */
  camera_config: Record<string, unknown> | null;
  duration_sec: number | null;
  /** Pre-rendered exemplars; present only for steps that were rendered (B-27 G2). */
  expected_views?: ExportExpectedView[];
}

export interface ExportInteractionConfig {
  /** read | rotate | press | … — a grader hint. */
  type?: string;
  parameters?: Record<string, unknown>;
}

export interface ExportExpectedView {
  /** authored | front | side | iso */
  angle: string;
  image_url: string;
  width: number;
  height: number;
}
