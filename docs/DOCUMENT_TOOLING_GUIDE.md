# DOCUMENT_TOOLING_GUIDE

Authority role: `navigation / tooling companion only`  
Authority registry: `authority-registry.v1`

この文書は、repo-local document tooling の使い方をまとめた companion guide です。

## 目的

文章生成や document ingestion を、その場しのぎではなく repo 管理された flow に揃えます。

## 主な要素

- MarkItDown
  - source から markdown へ落とすための変換系
- OpenDataLoader PDF
  - PDF を document pipeline に取り込むための loader
- SkillNet
  - skill / lesson / procedure を document 側から扱う補助面

## よく使うコマンド

- node scripts/document_tooling.js bootstrap
  - document tooling の初期化
- node scripts/document_tooling.js status
  - current status の確認
- npm run tooling:document:bootstrap
  - bootstrap の package script
- npm run tooling:document:status
  - status の package script

## 使いどころ

- repo 内の docs surface を追加するとき
- source material を markdown 化するとき
- document flow の current status を確認するとき
