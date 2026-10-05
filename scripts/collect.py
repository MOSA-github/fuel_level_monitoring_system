"""Fetch private camera sources; publish only readings (never source URLs)."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
from urllib.request import Request, urlopen, HTTPRedirectHandler, build_opener
import cv2
import numpy as np
from gauge import validate, read_gauge

ROOT = Path(__file__).resolve().parents[1]


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch_image(url):
    p = urlparse(url)
    if p.scheme != "https" or p.hostname != "camera.mosademy.tech" or p.port not in (None,443) or p.username or p.password:
        raise ValueError("Invalid source")
    import re
    if not re.fullmatch(r"/camera/latest/[A-Za-z0-9_-]+",p.path):
        raise ValueError("Invalid source path")
    with build_opener(NoRedirect()).open(Request(url,headers={"User-Agent":"MOSA-Gauge/1.0"}),timeout=30) as r:
        raw = r.read(10*1024*1024+1)
    if len(raw)>10*1024*1024:
        raise ValueError("Image too large")
    return cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR)


def collect(force=False):
    configs = json.loads((ROOT/"config/gauges.json").read_text(encoding="utf-8"))
    if not isinstance(configs,list) or len(configs)>100:
        raise ValueError("Expected at most 100 gauge configs")
    seen=set(); targets=set()
    for c in configs:
        validate(c)
        target=(c["facility_id"],c["device_id"])
        if c["id"] in seen or target in targets:
            raise ValueError("Duplicate gauge or device")
        seen.add(c["id"]); targets.add(target)
    source = json.loads(os.environ.get("CAMERA_SOURCES_JSON") or "{}")
    output=ROOT/"docs/data/latest.json"
    previous = json.loads(output.read_text(encoding="utf-8")) if output.exists() else {"readings":[]}
    old = {x["id"]:x for x in previous["readings"]}
    now=datetime.now(timezone.utc); stamp=now.isoformat()
    rows=[]; attempted=0
    for c in configs:
        base={k:c[k] for k in ("id","name","facility_id","device_id","camera_id","type","unit","is_demo","interval_minutes")}
        digest=hashlib.sha256(json.dumps(c,sort_keys=True).encode()).hexdigest()
        base["config_hash"]=digest
        if not c["enabled"]:
            rows.append(dict(base,status="disabled",value=None,updated_at=None,error="not_configured")); continue
        prev=old.get(c["id"],{})
        last=prev.get("attempted_at")
        if last and prev.get("config_hash")==digest and not force and now-datetime.fromisoformat(last)<timedelta(minutes=c["interval_minutes"]):
            rows.append(prev);continue
        attempted+=1
        try:
            if c["is_demo"]:
                image=cv2.imread(str(ROOT/"docs/assets/demo-meter.png"))
            elif c["camera_id"] in source:
                image=fetch_image(source[c["camera_id"]])
            else:
                raise KeyError("source missing")
            result=read_gauge(image,c)
        except KeyError:
            result={"status":"error","value":None,"error":"camera_source_missing"}
        except Exception:
            # Never expose network exception messages: they can contain secret URLs.
            result={"status":"error","value":None,"error":"acquisition_or_detection_failed"}
        row=dict(base,**result,attempted_at=stamp,updated_at=stamp if result["status"]=="normal" else None)
        rows.append(row)
        archive=ROOT/"docs/data/history"/c["id"]/(now.strftime("%Y-%m")+".jsonl")
        archive.parent.mkdir(parents=True,exist_ok=True)
        with archive.open("a",encoding="utf-8") as f: f.write(json.dumps(row,ensure_ascii=False)+"\n")
    payload=previous if rows==previous["readings"] else {"schema_version":1,"generated_at":stamp,"readings":rows}
    output.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    # Public configuration contains no camera credentials.
    (ROOT/"docs/data/gauges.json").write_text(json.dumps(configs,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Collected %d gauges; %d attempted; %d errors"%(len(rows),attempted,sum(r["status"]=="error" for r in rows)))


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--force",action="store_true")
    collect(parser.parse_args().force)
