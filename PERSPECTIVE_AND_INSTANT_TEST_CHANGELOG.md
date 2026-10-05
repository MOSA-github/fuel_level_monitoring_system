# 台形補正・即時針解析テスト 変更内容

## 追加した機能

1. ①最小目盛・②回転中心・③最大目盛は引き続き必須。
2. 任意の台形補正を追加。
   - `perspective_enabled`
   - `perspective_points.tl/tr/br/bl`
   - 元画像上で四隅を指定し、解析時に射影補正してから針検出。
3. 設定ページに「針の解析テスト」を追加。
   - 現在表示中の画像をブラウザ内で即時解析。
   - `interval_minutes` やGitHub Actionsを待たない。
   - 検出針を画像上に重ねて表示。
   - 値・割合・信頼度を表示。
   - 低信頼度時は候補を赤い破線で表示。
4. 保存・GitHub反映フローを設定画面とREADMEで明文化。
   - 下書き保存 = ブラウザのみ。
   - GitHubへ設定を反映 = `config/gauges.json` 更新 + mainへのcommitまで実行。
   - JSON書出し方式 = ユーザーが手動commit/push。
   - 「今すぐ解析」 = GitHub保存済み設定をforce実行。

## 後方互換性

- 旧設定に `perspective_enabled` / `perspective_points` がなくても台形補正OFFとして読み込み可能。
- 旧4点方式の `points.reference` も引き続き半径ヒントとして受理。

## 検証

- Python unittest: 17/17 PASS
- Node calibration tests: 10/10 PASS
- Python syntax compile: PASS
- settings.js syntax check: PASS
- Python detectorで台形化した合成画像を補正し、65%針を再検出するテスト: PASS
- ブラウザ側即時解析ロジックで50%合成針を検出するテスト: PASS
- 実デモ画像について、ブラウザ側即時解析とPython側で 73.448% が一致することを手動照合済み。

Playwrightはこの作業環境に未導入のため、`tests/browser.cjs` の実ブラウザE2E実行は未実施。ただしテストコード自体は即時針テストを確認する内容へ更新済み。
