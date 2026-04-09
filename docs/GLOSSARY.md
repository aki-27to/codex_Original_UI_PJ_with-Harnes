# GLOSSARY

## governed harness

`POST /api/exec`、`POST /api/eval/run`、contracts、evidence、release decision をまとめて扱う repo の核です。

## companion surface

core harness authority ではない隣接面です。`APP/` や companion docs はここに含まれます。

## current surface

`logs/current/` の固定された operator-facing summary 群です。直近の状態を最短で読む入口です。

## signoff bundle

`logs/bundles/signoff/` に出る、最終判断用の evidence bundle です。

## machine-readable contract

人間向けの説明ではなく、runtime や tests が直接読める契約です。主に `scripts/config/` にあります。

## runtime/

transient local caches、scratch payloads、regenerable captures の置き場です。source of truth ではありません。

## output/

intentional report / artifact surface です。named program や public/operator deliverable が置かれます。

## logs/

governed evidence と runtime proof の置き場です。`logs/current/`、`logs/bundles/`、`logs/archive/` に責務分離されています。

## agi_v1

既存 eval flow の上に載る extension-only evaluation profile です。parallel harness ではありません。

## release decision

runtime proof、machine-readable contracts、review/test/signoff evidence から導かれる最終判断状態です。

## owner-local posture

owner-operated local 実験を前提にした強い default posture です。`danger-full-access` や local auto `commit + push` はここに属します。universal guidance と同義ではありません。
