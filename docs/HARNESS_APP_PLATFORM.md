# HARNESS_APP_PLATFORM

Updated: 2026-04-12

## 1) 目的

この文書は、複数 app / companion surface が core harness authority を再定義せずに共存するための platform contract を説明します。

## 2) Safety Posture

- app は new constitution を持たない
- core authority は `HARNESS_CONSTITUTION.md`, `AGENTS.md`, machine-readable contracts
- broad external write や permission change を app ごとに勝手に増やさない

## 3) Registry Shape

platform は registry-backed です。app identity、entrypoint、runtime path、status surface を shared contract で持ちます。

## 4) Current Runtime Topology

現行の public operator surface は main harness を中心にし、adjacent app / companion は補助面として扱います。presentation-coach は除去済みで、catalog は現行 app のみを truth にします。
