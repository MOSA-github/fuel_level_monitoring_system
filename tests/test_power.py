import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from test_gauge import config, synthetic
import collect

class PowerTests(unittest.TestCase):
    def test_power_is_collected_and_published_with_its_selected_unit(self):
        for unit in ("W","kW"):
            with self.subTest(unit=unit),tempfile.TemporaryDirectory() as tmp:
                c=config();c.update(type="power",unit=unit,max_value=1000)
                root=Path(tmp);(root/"config").mkdir();(root/"docs/data").mkdir(parents=True)
                (root/"config/gauges.json").write_text(json.dumps([c]))
                with patch.object(collect,"ROOT",root),patch.dict("os.environ",{"CAMERA_SOURCES_JSON":'{"1":"source"}'}),patch.object(collect,"fetch_image",return_value=synthetic(c,.25)):
                    collect.collect(force=True)
                row=json.loads((root/"docs/data/devices/test.json").read_text())
                self.assertEqual(row["type"],"power");self.assertEqual(row["unit"],unit)
                self.assertEqual(row["status"],"normal")
                self.assertAlmostEqual(row["value"],250,delta=20)
                public_configs=json.loads((root/"docs/data/gauges.json").read_text())
                self.assertEqual(public_configs[0]["type"],"power")
