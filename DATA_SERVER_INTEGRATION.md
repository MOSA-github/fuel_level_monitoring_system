# 病院ダッシュボード連携

病院側では、施設IDや設備IDを解析側と一致させる必要はありません。
各計器に専用の公開JSON URLを使います。

例（設定IDが `demo-fuel` の場合）:

```text
https://mosa-github.github.io/fuel_level_monitoring_system/data/devices/demo-fuel.json
```

設定画面の「計器JSON URLをコピー」で取得できます。
`data/latest.json` は全計器一覧の互換・閲覧用です。病院設備との紐づけには専用URLを使用してください。
