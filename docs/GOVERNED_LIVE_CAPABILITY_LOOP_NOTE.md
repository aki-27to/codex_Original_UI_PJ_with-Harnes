# Governed Live Capability Loop Note

このノートは、governed memory 完了後に追加した live capability / readiness / continuity の意味を短く固定する補助文書です。
truth source は引き続き machine-readable config と canonical runtime projection にあります。

## 1. Observation Closure

- runtime hint / semantic lesson / improvement candidate は、turn 完了時と continuity closeout 時の real observation で強化します。
- canonical truth は `logs/archive/raw/runtime_state/memory/memory_events.jsonl` の `memory_observation_recorded` / `memory_observation_rejected` です。
- public proof は `output/memory_public/openai_primary_lane_projection.json` と `output/memory_public/anthropic_secondary_lane_projection.json` に出します。
- observation が missing evidence なら reject し、promotion / reinforcement に進めません。

## 2. Breadth Coverage

- `output/agi_readiness/domain_coverage_matrix.json` は repo が support すると宣言している family ごとに live evidence を出します。
- `domainScore` は agi_v1 bundle の matrix だけでなく、continuity / episodic event / eval observation の canonical evidence を使って補正します。
- `evidenceStatus` は `passing_evidence` / `failing_only` / `no_evidence` を区別します。
- headline の breadth は `output/agi_readiness/latest_readiness.json` の `supportedCoverageBreadth` を優先します。

## 3. Promotion Trend Semantics

- `output/agi_readiness/promotion_trend.json` は `comparisonMode` を必須にします。
- `self_snapshot` は distinct incumbent comparison ではありません。
- `cold_start` は incumbent 不在の初回閾値判定です。
- `distinct_comparison` のときだけ challenger-vs-incumbent の強い勝敗解釈を行います。

## 4. Weakest Gate Semantics

- `weakestGateFamily` は tie-break で雑に選びません。
- gate pressure は threshold margin と tie-aware rule に基づいて決めます。
- 全 gate が十分な margin を持つときは `weakestGateFamily` を空にし、`pressureStatus = "no_material_pressure"` にします。

## 5. Continuity Public Proof

- `output/continuity_public/latest_continuity.json` は real continuity task の public-safe summary です。
- handoff, blocked/verifier-failed subtask, release state, horizon summary を live runtime から集約します。
- `roleMemoryPackSections` は retrieval pack と agent tree の両方から補完します。

## 6. Robustness Breakdown

- `output/agi_readiness/robustness_breakdown.json` は live execution/eval evidence から作る public-safe breakdown です。
- 最低限、ambiguous instruction, adversarial/conflicting instruction, missing context, degraded tool outputs, browser/tool flakiness を扱います。
- `next_bottlenecks` は breadth が埋まった後、robustness の weakest category を live bottleneck として出せます。
