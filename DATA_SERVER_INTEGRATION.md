# data_test_server_page 連携

このシステムは **計測担当** です。病院一覧・設備台帳は `data_test_server_page` が担当します。

## 接続キー

公開結果の次の2項目だけで対応します。

```text
facility_id = HOSP-0001
device_id   = fuel-1
```

`data_test_server_page` 側にも同じ施設ID・設備IDの「燃料残量」設備を登録してください。
カメラURL、アクセストークン、①〜③、台形補正、針検出設定は病院側へコピーしません。

## 公開結果

`docs/data/latest.json` は以下のような公開データを含みます。

```json
{
  "facility_id": "HOSP-0001",
  "device_id": "fuel-1",
  "type": "fuel",
  "unit": "L",
  "value": 3178.322,
  "percent": 70.63,
  "status": "normal"
}
```

本番カメラURLは引き続き GitHub Actions Secret `CAMERA_SOURCES_JSON` だけに保存します。
