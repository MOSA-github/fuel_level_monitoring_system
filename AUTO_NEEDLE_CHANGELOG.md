# 自動針検出への変更

- 校正時に必須なのは ①最小目盛、②針の回転中心、③最大目盛の3点のみ。
- ④現在の針先端の手動指定を新規設定から廃止。
- 定期更新・手動force実行のたびに、取得した最新画像から針角度を再検出する。
- 新規3点設定では、①・③と②の距離から検出用の基準半径を自動算出する。
- 旧4点設定に `points.reference` が残る場合は互換性のため従来の半径を利用できる。
- 自動検出した角度から `value`, `percent`, `confidence`, `needle_point` を毎回生成する。
- 低信頼度時は従来どおり `value: null`, `status: error` とし、古い値を流用しない。

## 検証

- Python: 15 tests PASS
- Node calibration: 7 tests PASS
- デモ画像のforce収集: PASS（value 73.448%, status normal）
- 2枚の異なる疑似針画像を連続force更新し、約25% → 75%へ再検出されることをテスト済み。
- Browser/Playwright試験は実行環境にPlaywrightがないため未実行。JS構文チェックはPASS。
