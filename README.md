# カメラ式 貯水・電力・燃料残量モニター

[公開結果](https://mosa-github.github.io/fuel_level_monitoring_system/) /
[画像処理の設定](https://mosa-github.github.io/fuel_level_monitoring_system/settings.html) /
[全計器一覧JSON](https://mosa-github.github.io/fuel_level_monitoring_system/data/latest.json)

## まず理解しておく操作の違い

設定ページには、似ているようで役割の違う操作があります。

| 操作 | 何をするか | GitHubへ保存 | 本番解析 |
|---|---|---:|---:|
| 針の解析テスト | 今表示している画像をブラウザ内で即時解析 | しない | しない |
| 下書きを保存 | 現在の設定をこのブラウザのLocalStorageへ保存 | しない | しない |
| 設定JSONを書き出す | `gauges.json` をダウンロード | しない | しない |
| GitHubへ設定を反映 | `config/gauges.json` をGitHub APIで更新 | **mainへcommitまで行う** | commit後にActions起動 |
| GitHub保存済み設定を今すぐ解析 | workflow_dispatchでforce実行 | 設定は変更しない | **すぐ解析を依頼** |

したがって、**設定ページの「GitHubへ設定を反映」を使った場合は、その後に自分でcommitする必要はありません。**
一方、JSONを書き出して手元のGitリポジトリで管理する方式を使う場合は、`config/gauges.json` を置き換えて自分でcommit・pushします。

## 推奨する設定手順

1. 設定ページで「新しい計器」を選び、最新画像ファイルまたはカメラ最新JPEG URLを読み込む。
2. 画像上で①最小目盛、②針の回転中心、③最大目盛の3点を指定する。**①〜③は必須**。現在の針先端を手動設定する必要はない。
3. 計器面が斜めに写り、長方形が台形に見える場合だけ「台形補正」をONにする。計器の平面部分の四隅を左上→右上→右下→左下の順に指定する。正面撮影ならOFFのままでよい。
4. 回転方向、最小・最大値、単位、針の色などを設定する。
5. **「針の解析テスト」を押す。** 実行間隔やGitHub Actionsを待たず、その場で現在画像を解析する。検出した針を画像上に線で表示し、値・割合・信頼度を確認できる。この結果は保存されない。
6. 必要なら①〜③、台形補正、検出半径、針の色を調整し、再び「針の解析テスト」を行う。
7. カメラID・実行間隔を設定する。施設ID・設備IDは公開データの識別情報として残るが、病院側は公開データURLを貼るだけで連携できる。実カメラでは「検証用」をOFFにする。
8. `CAMERA_SOURCES_JSON` をActions Secretへ登録する。カメラURL・トークンを公開設定へ保存しない。
9. 「定期解析を有効」にする。
10. 本番反映は次のどちらか一方を行う。
    - **設定ページ方式**：「GitHubへ設定を反映」を押す。これで `config/gauges.json` 更新とmainへのcommitまで完了する。
    - **手動Git方式**：「設定JSONを書き出す」→ 手元の `config/gauges.json` に反映 → `git add` / `git commit` / `git push`。
11. mainへのcommit後、Actionsが起動して解析・公開を行う。結果はActions画面と公開結果で確認する。
12. 以後はGitHub Actionsが5分刻みで起動し、各計器の設定間隔を過ぎている場合だけ解析する。

### 手動Git方式の例

```sh
cp ~/Downloads/gauges.json config/gauges.json
git add config/gauges.json
git commit -m "Update gauge calibration"
git push origin main
```

設定ページの「GitHubへ設定を反映」を使った場合、この3コマンドは不要です。

## 台形補正

台形補正は任意です。固定カメラを正対させられる場合は、補正を使わない構成を推奨します。

ONの場合は、元画像上で計器の平面部分の四隅を `tl / tr / br / bl` として保存します。解析時にはOpenCVの射影変換でその四角形を長方形へ補正し、①〜③も同じ射影変換で補正してから針検出を行います。したがって、①〜③を補正後画像へ手作業で置き直す必要はありません。

台形補正点は、カメラや計器が動いた場合には再設定が必要です。レンズの強い樽型・糸巻き型歪みは台形補正とは別問題であり、本機能では補正しません。

## 即時の針解析テスト

「針の解析テスト」はJavaScriptでPython側と同じ考え方の放射方向コントラスト検出を実行します。

- 現在ブラウザに表示している画像を使用する。
- 未保存の①〜③や台形補正設定もそのまま使用する。
- GitHubへ通信しない。
- `interval_minutes` を待たない。
- GitHub Actionsを起動しない。
- 検出した針候補を画像上に重ねて表示する。
- 正常時は値・割合・信頼度を表示する。
- 低信頼度時はエラーとして、最有力候補を赤い破線で表示する。

これは**設定確認用**です。本番値として履歴や公開JSONには保存されません。

## 定期実行

`.github/workflows/monitor.yml` は以下の2種類で起動します。

- `main` へのpush：設定変更を含むcommit後に起動する。
- 5分刻みのschedule：各計器の `interval_minutes` を確認し、期限を過ぎた計器を解析する。

設定内容が変わるとconfig hashが変わるため、前回実行間隔が残っていても次回Actionsで再処理対象になります。「GitHub保存済み設定を今すぐ解析」は `workflow_dispatch` の `force=true` を使い、設定間隔を無視して即時解析を依頼します。

Actionsでは、テスト → カメラ取得 → 検出 → 公開JSON/履歴をcommit・push → Pagesデプロイを同一ワークフロー内で実行します。GitHub Actionsの起動遅延があるため、厳密な時刻実行は保証しません。

## 検出方式と適用範囲

①・③の目盛位置から回転中心までの半径を基準に検出領域を自動決定し、指定した内外半径の間で各角度の画像輝度を比較します。旧4点設定に④が残っている場合は互換性のためその半径を使用しますが、新規設定では④は不要です。両側の画素とのコントラストが継続する直線を針候補とします。暗い針／明るい針を選択できます。

台形補正がONの場合は、先に計器面を正面視相当に射影補正してから同じ検出を行います。

低信頼度・取得失敗・画角の縦横比変更では `value: null` と `status: error` を出力し、古い値を現在値に流用しません。反射、複数の針、文字、強いレンズ歪み、カメラ移動には誤検出の可能性があります。実画像で「針の解析テスト」を行ってから本番反映してください。

添付動画の5秒位置から計器部分だけを切り出した `docs/assets/demo-meter.png` を検証に使用しています。0〜100%の仮校正値であり、実タンク容量や現在の残量を示しません。

## 実カメラURL

Actions Secret `CAMERA_SOURCES_JSON` に以下の形式で登録します。

```json
{
  "カメラID": "https://camera.mosademy.tech/camera/latest/ID?token=..."
}
```

URLは `config/gauges.json` や公開データへ保存しません。

## 公開データ契約

`docs/data/latest.json`: `schema_version`, `generated_at`, `readings[]`。
各結果は `id`, `facility_id`, `device_id`, `camera_id`, `type`, `unit`, `value`, `status`, `is_demo`, `interval_minutes` を持ちます。有効な結果には `updated_at`, `confidence`, `needle_point`, `percent` を含みます。`needle_point` は各更新画像で検出した針から生成します。

履歴は `data/history/<設定ID>/YYYY-MM.jsonl`。時刻はUTCのISO 8601です。

## ローカル検証

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python scripts/collect.py --force
python -m http.server 8099 --directory docs
```

ブラウザE2Eを実行できる環境では `tests/browser.cjs` で、即時針テスト、設定編集、GitHub APIのmock、モバイル表示などを確認できます。


## 実カメラと設定画面の画像の違い

設定画面の「テスト用：カメラの最新画像を直接表示する」に入力するURLは、ブラウザで校正・即時解析を確認するためだけに使い、設定JSONには保存しません。

本番の自動解析は `config/gauges.json` の `camera_id` と GitHub Actions Secret `CAMERA_SOURCES_JSON` を対応付けて取得します。たとえば `camera_id` が `fuel-01` なら、Secret は次のようにします。

```json
{"fuel-01":"https://camera.mosademy.tech/camera/latest/1?token=..."}
```

`is_demo` が `true` の場合は実カメラを使わず、設定の `demo_image` が指す保存済み画像を解析します。`demo_image` がない既存設定は標準サンプル `docs/assets/demo-meter.png` を使用します。実カメラ運用では「本番解析でも固定デモ画像を使う」のチェックを外してください。

自動解析は GitHub Actions に5分ごとの起動を設定し、実際の起動時に各計器の `interval_minutes` を経過したときだけ、Secret に登録されたURLからその時点の最新JPEGを取得して解析します。校正点①〜③、台形補正4点、検出設定は保存済み設定を毎回再利用します。カメラの設置位置・画角・縦横比が変わった場合は再校正してください。

## 病院ダッシュボードとの役割分担

`fuel_level_monitoring_system` は画像取得・校正・針認識・値換算のみを行います。
病院・設備の一元管理は `data_test_server_page` に任せます。病院側にはこのシステムの公開 `data/latest.json` URLを登録します。公開JSONが1件だけならID合わせは不要で、複数件の場合だけ施設ID・設備IDで対象を選びます。
詳細は `DATA_SERVER_INTEGRATION.md` を参照してください。


## 病院側への連携

各計器は `docs/data/devices/<設定ID>.json` に1計器専用JSONを公開します。病院管理画面ではこのURLをそのまま登録します。施設ID・設備IDの一致判定は行いません。設定画面の「計器JSON URLをコピー」を使ってください。

## デモ画像をアプリから変更する

1. 設定ページの「画像ファイルを選ぶ」でPNG・JPEG・WebPを読み込む（10MB以下）。
2. その画像に合わせて①〜③、必要なら台形補正を設定し、針の解析テストを行う。
3. 「本番解析でも固定デモ画像を使う」をONにする。
4. GitHubトークンを入力し「設定を本番へ反映」を押す。
5. Actionsによる解析・Pages公開の完了後、ページを再読込する。以後は選択した画像を表示・解析する。

画像はPNGへ変換し、計器ごとの `demo_image: assets/demo-images/<SHA-256>.png` を設定に保存する。
同じ画像は同じパス、別の画像は別のパスとなるため、画像を変更してもブラウザの古いキャッシュを参照しない。
画像と校正設定はGitHub Git Data APIで同じcommitに含め、mainをfast-forwardで更新する。
同時更新を検知した場合は他の変更を上書きせずエラーにする。Contentsのwrite権限が必要。
画像を別の計器に流用しても、各設定の参照先は独立している。過去に使った画像は履歴との対応を保つため残す。

デモ画像は公開サイトとリポジトリで公開される。実カメラ設定（is_demo=false）でテストするために選んだ画像はアップロードしない。
ブラウザの下書き保存・設定JSONの書出しは画像ファイルを保存しない。画像を保存するには本番への反映を使う。
以前のバージョンで選択した画像はGitHubへ保存されていないため、修正版で再選択して本番へ反映する必要がある。

## 5分設定と実際の更新時刻

GitHub ActionsのCronは毎時2・7・12…57分（UTC）、5分おきに起動を依頼する。混雑する毎時0分を避ける構成。
GitHubのscheduleには起動の遅延・取りこぼしがあるため、厳密な5分ごとの解析完了やPages公開を保証しない。
補助起動：`data_management_server_private`の`deploy/systemd/mosademy-gauge-dispatch.timer`が同じActionsを5分ごとに`scheduled=true`で起動する構成にも対応。テスト・解析・公開手順は共通で、進行中・同じ5分枠の重複を避ける。履歴の「定期解析（サーバー補助）」で確認できる。GitHubのschedule・push・通常の手動実行も維持する。
公式仕様: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

定期実行時は `collect.py --scheduled` でUTCの5分枠を比較する。前回の起動より数秒早かっただけで5分間隔の計器をスキップしない。
手動実行の「設定間隔を無視して今すぐ解析」（`force`）は通常OFFでよい。「サーバー補助タイマーの定期解析」（`scheduled`）は補助タイマーが指定する項目で、通常の手動実行ではOFFのままにする。
同じ5分枠での重複解析を避け、60分など各計器に設定した間隔も維持する。手動実行では従来の経過時間判定、forceでは間隔を無視して再解析する。

公開画面には設定間隔・最終解析時刻・最終成功時刻・ページの確認時刻を表示する。
最終解析から max(10分, 設定間隔×2) を超えた場合に更新遅延を表示し、最終成功から max(30分, 設定間隔×3) を超えた値は期限切れとして隠す。
取得・解析エラーと定期起動の遅延は区別する。「設定・今すぐ解析」から保存済み設定の手動再解析を依頼できる。
固定デモ画像では画像と校正設定が同じなら数値も同じになるため、更新の確認には解析時刻を使う。
残量の出力値 value と残量率 percent は小数点第一位までに丸める。公開JSONと新規履歴、ブラウザの即時解析に共通の精度を適用する。画面では小数点第一位を表示する。


## 電力計の設定

測定対象に「電力」（type: power）を選択できる。選択時は単位の初期値がWになり、kWなどへ編集できる。
計器の①最小目盛・②針の回転中心・③最大目盛、最小値・最大値を設定して校正する。
即時解析・定期解析・公開JSON・履歴に電力種別と単位を保存し、値は小数点第一位まで出力する。
管理基盤には計器専用JSON URLを登録して、消費電力の項目として取り込む。
