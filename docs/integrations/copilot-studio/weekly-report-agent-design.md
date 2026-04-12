# Copilot Studio 週次レポート設計メモ

## 目的

Teams / Outlook / 作業メモから週次レポート素材を集め、Markdown テンプレートへ整形する companion workflow の設計メモです。core harness の constitution を置き換えるものではありません。

## 構成要素

- Copilot Studio: 対話面と markdown 生成
- Power Automate: Outlook / Teams / reminder / packet 集約
- Microsoft To Do list `Weekly Evidence`: 素材の一時集約
- Markdown テンプレート: `WeeklyReportTemplate.md`

## 想定フロー

- `WR_TEAMS_CHANNEL_TO_EVIDENCE_V1`
  - Teams から証跡候補を `Weekly Evidence` へ送る
- `WR_OUTLOOK_SENT_TO_EVIDENCE_V1`
  - Outlook Sent Items から証跡候補を `Weekly Evidence` へ送る
- `WR_ADD_WORK_MEMO_TO_EVIDENCE_V1`
  - Copilot Studio で入力した作業メモを `Weekly Evidence` へ送る
- `WR_GET_WEEKLY_EVIDENCE_PACKET_V1`
  - 一週間分の Teams / Outlook / memo を packet 化して返す
- `WR_WEEKLY_DRAFT_REMINDER_V1`
  - 毎週金曜 18:00 JST に draft reminder を出す

## 制約

- SharePoint ではなく Microsoft To Do を簡易集約面として使う
- 1 件 1 素材として扱い、`[Mail]` / `[Teams]` / `[Memo]` の接頭辞で区別する
- web scraping を主経路にしない
- Copilot Studio 側は入力と整形に寄せ、証跡収集の責務は flow に置く

## operator フロー

1. 一週間の素材を `Weekly Evidence` へ集約
2. `WR_GET_WEEKLY_EVIDENCE_PACKET_V1` を実行
3. packet を `WeeklyReportTemplate.md` に流し込んで下書きを作る
4. 不足やリスクを追記
5. 次週 plan を補って完成
