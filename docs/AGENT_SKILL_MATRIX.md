# AGENT_SKILL_MATRIX

Updated: 2026-04-12

## 0) Skill ID Consistency

skill id の正本は `scripts/config/skill_catalog.json` です。文書上の表記ゆれで runtime を分岐させてはいけません。

## 1) Classification Model

この表は role ごとの expected skill surface と不足候補を整理します。runtime routing 自体の正本ではなく、運用と proposal の補助面です。

## 2) Role Assignment Summary

- `default`: parent dispatch / requirement / review / product framing
- `intake`: requirement lock / discovery
- `release_manager`: evidence gate / signoff
- `frontend_worker`: browser / visual / UI regression
- `backend_worker`: protocol / API / server
- `infra_worker`: runtime / launcher / logging
- `tester`: executable validation
- `reviewer`: independent finding
- `explorer`: read-only fact finding

## 3) Skill Metadata Registry

各 skill proposal は最低でも次を持ちます。
- proposal id
- intended owner role
- missing capability
- expected evidence
- promotion target or reason to stay proposal-only

## 4) Current Gaps

gap proposal はここに維持しますが、runtime に勝手に流し込んではいけません。self-improvement gate と portfolio governance を通したものだけ昇格します。
