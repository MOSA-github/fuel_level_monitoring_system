# Camera / perspective clarity update

- 台形補正ON時の4点・紫ポリゴンを見やすくした。
- 画像読み込み後、台形補正ONかつ4点未設定なら画像四隅をidentity初期値にする。
- 台形補正の状態を「OFF / ON・4点設定済み / 未完了」で明示する。
- テスト表示用カメラURLと本番自動更新のカメラソースを明確に分離表示する。
- is_demo=true の場合、自動更新が実カメラを使わないことを警告する。
- 本番は camera_id -> Actions Secret CAMERA_SOURCES_JSON のURLを参照する。
