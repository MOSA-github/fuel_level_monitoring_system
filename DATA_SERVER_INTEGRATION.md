# data_test_server_page との連携

病院ダッシュボード側では、このシステムが公開する **データURLを貼るだけ**で連携できます。

公開URL:

```text
https://mosa-github.github.io/fuel_level_monitoring_system/data/latest.json
```

設定画面の「04 / 本番へ反映」に同じURLを表示し、「URLをコピー」ボタンも用意しています。

公開JSONにreadingが1件だけの場合、病院側の設備IDと解析側のIDを一致させる必要はありません。複数計器を1つのURLに含める場合だけ、`facility_id + device_id` または設備IDで対象を選びます。

カメラURL、アクセストークン、①〜③、台形補正、針検出条件は病院ダッシュボードへ渡しません。
