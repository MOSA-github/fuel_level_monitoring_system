# カメラ式 貯水・燃料残量モニター

[公開結果](https://mosa-github.github.io/fuel_level_monitoring_system/) /
[画像処理の設定](https://mosa-github.github.io/fuel_level_monitoring_system/settings.html) /
[最新JSON](https://mosa-github.github.io/fuel_level_monitoring_system/data/latest.json)

## カメラ設置後の設定

1. 設定ページで「新しい計器」を選び、最新画像ファイルまたはカメラ最新JPEG URLを読み込む。
2. 画像上で①最小目盛、②針の回転中心、③最大目盛の3点を指定する。**①〜③は必須**。現在の針先端を手動設定する必要はない。中心が隠れた計器では回転中心の推定が必要。画像サイズに対する0〜1の座標で保存する。
3. 回転方向、最小・最大値、単位を設定する。定期更新時は最新画像から針を自動検出し、値 = 最小値 + 検出した針角度 / ∠①②③ × (最大値 − 最小値) として換算する。角度は画像の縦横比を考慮する。
4. 施設ID・設備IDを管理基盤と一致させ、種別を貯水または発電機にする。カメラIDは認証URLの参照キー。
5. 実行間隔を5〜10080分で指定する。実カメラでは「検証用」をOFFにする。
6. Actions Secret `CAMERA_SOURCES_JSON` を `{"カメラID":"https://camera.mosademy.tech/camera/latest/ID?token=..."}` として登録する。カメラURL・トークンを公開設定へ保存しない。
7. 「定期解析を有効」にし、GitHubへ反映する。公開サイトには書き込み機能がないため、GitHub APIで `config/gauges.json` を更新する。PATは Contents / Actions のwrite権限を必要とし、ブラウザのメモリ内のみで扱う。
8. Actionsの成功と公開結果を確認する。「今すぐ解析」はGitHubに保存済みの設定を使用する。

下書き保存はこのブラウザ内のみ。JSONの書出し・読込みも可能。GitHub反映は選択中の1件のみを既存設定と統合し、同時更新を検知して上書きを防ぐ。
名称・座標・施設ID・設備IDは公開情報になる。

## 定期実行

`.github/workflows/monitor.yml` が5分刻みで起動し、前回試行から設定間隔を過ぎた計器を処理する。GitHub Actionsの遅延や休止があるため、厳密な5分間隔や可用性を保証しない。設定内容が変われば次回起動で再処理する。手動force実行は間隔を無視する。

テスト → カメラ取得 → 検出 → 公開JSON/履歴をcommit・push → Pagesデプロイを同一ワークフロー内で実行する。GITHUB_TOKENのcommitで別workflowが起動しない場合にも公開が更新される。PagesのBuild and deploymentはGitHub Actionsを指定する。

## 検出方式と適用範囲

①・③の目盛位置から回転中心までの半径を基準に検出領域を自動決定し、指定した内外半径の間で各角度の画像輝度を比較する。旧4点設定に④が残っている場合は互換性のためその半径を使用するが、新規設定では④は不要。両側の画素とのコントラストが継続する直線を針候補とする。暗い針／明るい針を選択可能。信頼度は競合ピークとの差とコントラストによる指標で、計測精度の保証値ではない。

低信頼度・取得失敗・画角の縦横比変更では `value: null` と `status: error` を出力し、古い値を現在値に流用しない。斜め撮影、反射、複数の針、文字、レンズ歪み、カメラ移動には誤検出の可能性がある。固定カメラを計器に正対させ、実画像で校正・比較してから利用する。同じ縦横比での移動は自動検知できない。針の角度と量が非線形の計器は対象外。

添付動画の5秒位置から計器部分だけを切り出した `docs/assets/demo-meter.png` を検証に使用。0〜100%の仮校正値であり、実タンク容量や現在の残量を示さない。公開JSONには `is_demo: true` / 施設ID `DEMO` を付け、管理基盤の実測値には取り込まない。

## 公開データ契約

`docs/data/latest.json`: `schema_version`, `generated_at`, `readings[]`。
各結果は `id`, `facility_id`, `device_id`, `camera_id`, `type`, `unit`, `value`, `status`, `is_demo`, `interval_minutes` を持つ。有効な結果には `updated_at`, `confidence`, `needle_point`, `percent` を含む。`needle_point` は保存済みの手動点ではなく、その更新画像で自動検出した針角度から毎回生成する。試行時刻は `attempted_at`。停止中は `status: disabled`。

履歴: `data/history/<設定ID>/YYYY-MM.jsonl`。時刻はUTCのISO 8601。閲覧時にローカル時刻へ変換する。
管理基盤は `is_demo=false` の結果を施設・設備IDで対応付け、最終成功から `max(30, interval_minutes × 3)` 分を超えた値を期限切れとして非表示にする。
公開JSONは誰でも参照可能。カメラ原画像や認証URLは公開しない（明示した動画サンプルのみ公開）。

## ローカル検証

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
node --test tests/calibration.test.mjs
python scripts/collect.py --force
python -m http.server 8099 --directory docs
```

Python 3.11を推奨。検証用サンプルはSecretなしで実行できる。実カメラはSecret登録と設置後の校正が必要。
