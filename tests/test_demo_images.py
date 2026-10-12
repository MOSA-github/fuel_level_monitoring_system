import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import cv2
from test_gauge import config, synthetic
import collect
from gauge import validate

class DemoImageTests(unittest.TestCase):
    def setup_root(self,tmp,c):
        root=Path(tmp);(root/"config").mkdir();(root/"docs/assets/demo-images").mkdir(parents=True)
        (root/"config/gauges.json").write_text(json.dumps([c]))
        return root
    def test_changed_demo_image_is_used_and_invalidates_interval(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=config();c["is_demo"]=True;c["demo_image"]="assets/demo-images/"+("a"*64)+".png"
            root=self.setup_root(tmp,c)
            cv2.imwrite(str(root/"docs"/c["demo_image"]),synthetic(c,.25))
            cv2.imwrite(str(root/"docs/assets/demo-meter.png"),synthetic(c,.9))
            with patch.object(collect,"ROOT",root),patch.object(collect,"fetch_image") as fetch:
                collect.collect()
                first=json.loads((root/"docs/data/latest.json").read_text())["readings"][0]
                self.assertAlmostEqual(first["value"],25,delta=2)
                self.assertEqual(first["demo_image"],c["demo_image"])
                c["demo_image"]="assets/demo-images/"+("b"*64)+".png"
                cv2.imwrite(str(root/"docs"/c["demo_image"]),synthetic(c,.75))
                (root/"config/gauges.json").write_text(json.dumps([c]))
                collect.collect()
                second=json.loads((root/"docs/data/devices/test.json").read_text())
                self.assertAlmostEqual(second["value"],75,delta=2)
                self.assertEqual(second["demo_image"],c["demo_image"])
                fetch.assert_not_called()
    def test_missing_custom_image_never_falls_back_to_old_sample(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=config();c["is_demo"]=True;c["demo_image"]="assets/demo-images/"+("a"*64)+".png"
            root=self.setup_root(tmp,c)
            cv2.imwrite(str(root/"docs/assets/demo-meter.png"),synthetic(c,.9))
            with patch.object(collect,"ROOT",root):collect.collect()
            row=json.loads((root/"docs/data/latest.json").read_text())["readings"][0]
            self.assertIsNone(row["value"]);self.assertEqual(row["status"],"error")
    def test_legacy_sample_still_works(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=config();c["is_demo"]=True;root=self.setup_root(tmp,c)
            cv2.imwrite(str(root/"docs/assets/demo-meter.png"),synthetic(c,.5))
            with patch.object(collect,"ROOT",root):collect.collect()
            row=json.loads((root/"docs/data/latest.json").read_text())["readings"][0]
            self.assertAlmostEqual(row["value"],50,delta=2)
            self.assertEqual(row["demo_image"],"assets/demo-meter.png")
    def test_untrusted_demo_path_is_rejected(self):
        for path in ["../secret","https://example.com/image.png","assets/demo-images/../../secret","assets/demo-images/a.svg",None]:
            c=config();c["demo_image"]=path
            with self.subTest(path=path),self.assertRaises(ValueError):validate(c)
