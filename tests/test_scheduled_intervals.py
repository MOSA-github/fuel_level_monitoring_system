import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from test_gauge import config, synthetic
import collect

class Clock(datetime):
    current=None
    @classmethod
    def now(cls,tz=None):
        return cls.current

class ScheduledIntervalTests(unittest.TestCase):
    def test_server_timer_dispatch_keeps_existing_validated_workflow(self):
        workflow=(Path(__file__).resolve().parents[1]/'.github/workflows/monitor.yml').read_text(encoding='utf-8')
        self.assertIn('      scheduled:\n',workflow)
        self.assertIn("github.event_name == 'schedule' || inputs.scheduled || false",workflow)
        self.assertIn("- cron: '2-59/5 * * * *'",workflow)
        self.assertIn('    branches: [main]',workflow)
        self.assertIn('cancel-in-progress: false',workflow)
        steps=['Test detector and calibration','Collect due readings','Persist public readings','Deploy public results']
        positions=[workflow.index(step) for step in steps]
        self.assertEqual(positions,sorted(positions))

    def run_times(self,interval,times,scheduled):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/"config").mkdir();(root/"docs/data").mkdir(parents=True)
            c=config();c["interval_minutes"]=interval
            (root/"config/gauges.json").write_text(json.dumps([c]))
            with patch.object(collect,"ROOT",root),patch.object(collect,"datetime",Clock),patch.dict("os.environ",{"CAMERA_SOURCES_JSON":'{"1":"source"}'}),patch.object(collect,"fetch_image",return_value=synthetic(c,.5)) as fetch:
                for stamp in times:
                    Clock.current=datetime.fromisoformat(stamp)
                    collect.collect(scheduled=scheduled)
                return fetch.call_count
    def test_jitter_does_not_skip_next_scheduled_slot(self):
        count=self.run_times(5,["2026-10-13T03:02:50+00:00","2026-10-13T03:07:20+00:00"],True)
        self.assertEqual(count,2)
    def test_same_slot_never_collects_twice(self):
        count=self.run_times(5,["2026-10-13T03:07:20+00:00","2026-10-13T03:09:50+00:00"],True)
        self.assertEqual(count,1)
    def test_longer_intervals_are_preserved(self):
        count=self.run_times(60,["2026-10-13T03:02:50+00:00","2026-10-13T03:07:20+00:00","2026-10-13T04:02:20+00:00"],True)
        self.assertEqual(count,2)
    def test_manual_collection_keeps_exact_elapsed_time(self):
        count=self.run_times(5,["2026-10-13T03:02:50+00:00","2026-10-13T03:07:20+00:00"],False)
        self.assertEqual(count,1)
