# Easy publish UX update

- Fixed hidden HTML validation mismatch: `outer_radius=0.72` is now valid (`step=0.01`).
- Replaced generic `入力欄を確認してください` with the exact invalid field name and reason.
- Invalid fields inside collapsed details automatically open, highlight, scroll into view, and receive focus.
- Simplified production flow to: needle test -> GitHub token -> `設定を本番へ反映`.
- Moved draft / JSON import-export / forced rerun into advanced operations.
- Added calibration and production-source readiness summary.
- Added current `CAMERA_SOURCES_JSON` example derived from camera ID.
- Main publish button still commits `config/gauges.json` to `main`; the existing push-triggered GitHub Actions run performs collection and Pages publication.
