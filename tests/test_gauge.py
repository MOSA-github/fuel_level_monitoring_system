import copy
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import cv2
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from gauge import read_gauge, validate
import collect

def config():
    return {"id":"test","camera_id":"1","facility_id":"HOSP-0001","device_id":"water-1","name":"Test","type":"water","unit":"%","enabled":True,"is_demo":False,"interval_minutes":60,"min_value":0,"max_value":100,"direction":"cw","polarity":"dark","min_confidence":.3,"inner_radius":.35,"outer_radius":.85,"image_size":[400,300],"points":{"min":[.2,.6],"center":[.5,.8],"max":[.8,.6],"reference":[.5,.32]}}

def synthetic(c,ratio):
    im=np.full((300,400,3),230,np.uint8)
    from gauge import geometry
    start,span,_=geometry(c,400,300)
    a=start+(1 if c["direction"]=="cw" else -1)*span*ratio
    center=(200,240)
    tip=(round(200+math.cos(a)*140),round(240+math.sin(a)*140))
    cv2.line(im,center,tip,(20,20,20),5)
    return im

class DetectorTests(unittest.TestCase):
    def test_known_positions(self):
        for ratio in (0,.1,.25,.5,.75,.9,1):
            with self.subTest(ratio=ratio):
                c=config();r=read_gauge(synthetic(c,ratio),c)
                self.assertEqual(r["status"],"normal")
                self.assertAlmostEqual(r["value"],ratio*100,delta=2)
    def test_counterclockwise_and_nonzero_range(self):
        c=config();c["points"]["min"],c["points"]["max"]=c["points"]["max"],c["points"]["min"]
        c.update(direction="ccw",min_value=20,max_value=220)
        self.assertAlmostEqual(read_gauge(synthetic(c,.25),c)["value"],70,delta=3)
    def test_light_needle(self):
        c=config();c["polarity"]="light"
        self.assertAlmostEqual(read_gauge(255-synthetic(c,.7),c)["value"],70,delta=2)
    def test_blank_image_is_not_a_reading(self):
        r=read_gauge(np.full((300,400,3),200,np.uint8),config())
        self.assertEqual(r["status"],"error");self.assertIsNone(r["value"])
    def test_competing_needles_are_rejected(self):
        c=config();a=synthetic(c,.25);b=synthetic(c,.75)
        r=read_gauge(np.minimum(a,b),c)
        self.assertIsNone(r["value"])
    def test_aspect_ratio_changed(self):
        with self.assertRaises(ValueError):read_gauge(np.zeros((400,400,3),np.uint8),config())
    def test_invalid_configuration(self):
        for field,value in [("interval_minutes",0),("interval_minutes",float("nan")),("id","../escape"),("min_value",float("nan")),("max_value",-1),("inner_radius",1),("unit",None)]:
            c=config();c[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):validate(c)
    def test_reference_outside_sweep(self):
        c=config();c["points"]["reference"]=[.5,.95]
        with self.assertRaises(ValueError):validate(c)
    def test_video_sample(self):
        root=Path(__file__).resolve().parents[1]
        c=json.loads((root/"tests/fixtures/demo.json").read_text(encoding="utf-8"))[0]
        if not c["is_demo"]:self.skipTest("sample replaced")
        result=read_gauge(cv2.imread(str(root/"docs/assets/demo-meter.png")),c)
        self.assertEqual(result["status"],"normal")
        self.assertGreater(result["value"],65);self.assertLess(result["value"],82)

class CollectionTests(unittest.TestCase):
    def setup_root(self,tmp,c):
        root=Path(tmp);(root/"config").mkdir();(root/"docs/data").mkdir(parents=True)
        (root/"config/gauges.json").write_text(json.dumps([c]))
        return root
    def test_due_gate_and_config_change(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=config();root=self.setup_root(tmp,c)
            with patch.object(collect,"ROOT",root),patch.dict("os.environ",{"CAMERA_SOURCES_JSON":'{"1":"secret-source"}'}),patch.object(collect,"fetch_image",return_value=synthetic(c,.5)) as fetch:
                collect.collect();collect.collect()
                self.assertEqual(fetch.call_count,1)
                c["max_value"]=200;(root/"config/gauges.json").write_text(json.dumps([c]))
                collect.collect();self.assertEqual(fetch.call_count,2)
                collect.collect(force=True);self.assertEqual(fetch.call_count,3)
    def test_missing_secret_never_retains_stale_value(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=config();root=self.setup_root(tmp,c)
            with patch.object(collect,"ROOT",root),patch.dict("os.environ",{"CAMERA_SOURCES_JSON":'{"1":"secret-source"}'}),patch.object(collect,"fetch_image",return_value=synthetic(c,.5)):
                collect.collect()
            with patch.object(collect,"ROOT",root),patch.dict("os.environ",{"CAMERA_SOURCES_JSON":"{}"}):
                collect.collect(force=True)
            raw=(root/"docs/data/latest.json").read_text()
            r=json.loads(raw)["readings"][0]
            self.assertIsNone(r["value"]);self.assertIsNone(r["updated_at"])
            self.assertEqual(r["error"],"camera_source_missing")
            self.assertNotIn("secret-source",raw)
    def test_disabled_and_duplicate(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=config();c["enabled"]=False;root=self.setup_root(tmp,c)
            with patch.object(collect,"ROOT",root),patch.object(collect,"fetch_image") as fetch:
                collect.collect();fetch.assert_not_called()
                self.assertEqual(json.loads((root/"docs/data/latest.json").read_text())["readings"][0]["status"],"disabled")
                (root/"config/gauges.json").write_text(json.dumps([c,c]))
                with self.assertRaises(ValueError):collect.collect()
    def test_source_url_allowlist(self):
        for url in ["http://camera.mosademy.tech/camera/latest/1","https://example.com/a","https://camera.mosademy.tech/admin","https://camera.mosademy.tech.evil.test/camera/latest/1","https://u:p@camera.mosademy.tech/camera/latest/1"]:
            with self.subTest(url=url),self.assertRaises(ValueError):collect.fetch_image(url)

if __name__=="__main__":unittest.main()
