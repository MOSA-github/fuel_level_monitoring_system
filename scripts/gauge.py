"""Calibrated radial contrast detector with optional perspective rectification.

Required calibration points:
  min    : minimum tick
  center : needle rotation center
  max    : maximum tick

The current needle is detected on every image. If the gauge face is viewed
obliquely, four optional perspective points (tl,tr,br,bl) can be supplied. The
image and calibration points are rectified before needle detection.
"""
import copy
import math
import re
import cv2
import numpy as np

REQUIRED_POINT_KEYS = ("center", "min", "max")
PERSPECTIVE_KEYS = ("tl", "tr", "br", "bl")
BASE_FIELDS = {"id", "camera_id", "facility_id", "device_id", "name", "type", "unit", "enabled", "is_demo", "interval_minutes", "min_value", "max_value", "direction", "polarity", "min_confidence", "inner_radius", "outer_radius", "image_size", "points"}
OPTIONAL_FIELDS = {"perspective_enabled", "perspective_points"}


def _valid_point(p):
    return isinstance(p, (list, tuple)) and len(p) == 2 and all(type(x) in (int, float) and math.isfinite(x) and 0 <= x <= 1 for x in p)


def _perspective_enabled(c):
    return bool(c.get("perspective_enabled", False))


def _perspective_points(c, w, h):
    pp = c.get("perspective_points") or {}
    if any(not _valid_point(pp.get(k)) for k in PERSPECTIVE_KEYS):
        raise ValueError("Perspective correction requires tl,tr,br,bl")
    src = np.float32([[pp[k][0] * (w - 1), pp[k][1] * (h - 1)] for k in PERSPECTIVE_KEYS])
    area = abs(float(cv2.contourArea(src.reshape(-1, 1, 2))))
    if area < w * h * 0.005:
        raise ValueError("Perspective region too small")
    return src


def _perspective_model(c, w, h):
    if not _perspective_enabled(c):
        return None
    src = _perspective_points(c, w, h)
    tl, tr, br, bl = src
    out_w = max(16, int(round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))) + 1)
    out_h = max(16, int(round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))) + 1)
    if out_w > 12000 or out_h > 12000:
        raise ValueError("Perspective output too large")
    dst = np.float32([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]])
    H = cv2.getPerspectiveTransform(src, dst)
    inverse = cv2.getPerspectiveTransform(dst, src)
    return src, dst, out_w, out_h, H, inverse


def validate(c):
    if not isinstance(c, dict) or not BASE_FIELDS.issubset(c) or not set(c).issubset(BASE_FIELDS | OPTIONAL_FIELDS):
        raise ValueError("Unknown or missing config fields; source URLs belong in Secrets")
    for key in ("id", "camera_id", "facility_id", "device_id"):
        if not isinstance(c.get(key), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", c[key]):
            raise ValueError("Invalid identifier: " + key)
    if c.get("type") not in ("water", "fuel", "generator"):
        raise ValueError("Invalid sensor type")
    if type(c.get("enabled")) is not bool or type(c.get("is_demo")) is not bool:
        raise ValueError("enabled/is_demo must be booleans")
    if "perspective_enabled" in c and type(c["perspective_enabled"]) is not bool:
        raise ValueError("perspective_enabled must be boolean")
    if type(c.get("interval_minutes")) is not int or not 5 <= c["interval_minutes"] <= 10080:
        raise ValueError("Interval must be 5..10080 minutes")
    for key in ("min_value", "max_value", "min_confidence", "inner_radius", "outer_radius"):
        if type(c.get(key)) not in (int, float) or not math.isfinite(c[key]):
            raise ValueError("Invalid numeric field: " + key)
    if c["max_value"] <= c["min_value"] or not 0 <= c["min_confidence"] <= 1:
        raise ValueError("Invalid range or confidence")
    if not 0.1 <= c["inner_radius"] < c["outer_radius"] <= 1.3:
        raise ValueError("Invalid detection annulus")
    if c.get("direction") not in ("cw", "ccw") or c.get("polarity") not in ("dark", "light"):
        raise ValueError("Invalid direction/polarity")
    if not isinstance(c.get("unit"), str) or not c["unit"] or len(c["unit"]) > 20:
        raise ValueError("Invalid unit")
    if not isinstance(c.get("name"), str) or not c["name"] or len(c["name"]) > 120:
        raise ValueError("Invalid name")

    points = c.get("points")
    if not isinstance(points, dict):
        raise ValueError("Invalid points")
    for key in REQUIRED_POINT_KEYS:
        if not _valid_point(points.get(key)):
            raise ValueError("Invalid point: " + key)
        if key != "center" and math.dist(points[key], points["center"]) < 0.02:
            raise ValueError("Point too close to center")
    if "reference" in points:
        if not _valid_point(points["reference"]):
            raise ValueError("Invalid point: reference")
        if math.dist(points["reference"], points["center"]) < 0.02:
            raise ValueError("Point too close to center")

    size = c.get("image_size", [])
    if len(size) != 2 or any(type(x) is not int or not 16 <= x <= 12000 for x in size):
        raise ValueError("Invalid image size")
    if _perspective_enabled(c):
        _perspective_model(c, *size)
    elif "perspective_points" in c and c["perspective_points"] not in ({}, None):
        pp = c["perspective_points"]
        if not isinstance(pp, dict) or any(k not in PERSPECTIVE_KEYS for k in pp) or any(not _valid_point(v) for v in pp.values()):
            raise ValueError("Invalid perspective points")
    _, span = geometry(c, *size)
    if not math.radians(5) <= span <= math.radians(350):
        raise ValueError("Invalid sweep")
    return c


def _rectified_config(c, w, h):
    model = _perspective_model(c, w, h)
    if model is None:
        return None, c
    _, _, out_w, out_h, H, inverse = model
    cc = copy.deepcopy(c)
    transformed = {}
    for key in (*REQUIRED_POINT_KEYS, "reference"):
        if key not in c["points"]:
            continue
        raw = np.float32([[[c["points"][key][0] * (w - 1), c["points"][key][1] * (h - 1)]]])
        q = cv2.perspectiveTransform(raw, H)[0, 0]
        transformed[key] = [float(q[0] / (out_w - 1)), float(q[1] / (out_h - 1))]
    cc["points"] = transformed
    cc["image_size"] = [out_w, out_h]
    cc["perspective_enabled"] = False
    return inverse, cc


def geometry(c, w, h):
    if _perspective_enabled(c):
        _, c = _rectified_config(c, w, h)
        w, h = c["image_size"]
    p = c["points"]
    def angle(key):
        return math.atan2((p[key][1] - p["center"][1]) * h, (p[key][0] - p["center"][0]) * w)
    sign = 1 if c["direction"] == "cw" else -1
    start = angle("min")
    return start, ((angle("max") - start) * sign) % (2 * math.pi)


def calibration_radius(c, w, h):
    p = c["points"]
    center = np.array(p["center"], dtype=float)
    scale = np.array([w, h], dtype=float)
    if "reference" in p:
        return float(np.linalg.norm((np.array(p["reference"], dtype=float) - center) * scale))
    tick_radii = [float(np.linalg.norm((np.array(p[key], dtype=float) - center) * scale)) for key in ("min", "max")]
    return float(np.median(tick_radii))


def read_gauge(image, c):
    validate(c)
    if image is None or image.ndim != 3:
        raise ValueError("Invalid image")
    raw_h, raw_w = image.shape[:2]
    if abs(raw_w / raw_h - c["image_size"][0] / c["image_size"][1]) > 0.015:
        raise ValueError("Image aspect ratio changed; recalibration required")

    inverse, dc = _rectified_config(c, raw_w, raw_h)
    if inverse is not None:
        model = _perspective_model(c, raw_w, raw_h)
        _, _, w, h, H, _ = model
        work = cv2.warpPerspective(image, H, (w, h), flags=cv2.INTER_LINEAR)
    else:
        work = image
        dc = c
        h, w = raw_h, raw_w

    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY).astype(np.float32)
    cx, cy = np.array(dc["points"]["center"]) * [w, h]
    radius = calibration_radius(dc, w, h)
    start, span = geometry(dc, w, h)
    sign = 1 if dc["direction"] == "cw" else -1
    offsets = np.linspace(0, span, max(121, int(math.degrees(span) * 3)))
    angles = start + sign * offsets
    radii = np.linspace(radius * dc["inner_radius"], radius * dc["outer_radius"], 100)

    def sample(a):
        x = cx + np.cos(a[:, None]) * radii
        y = cy + np.sin(a[:, None]) * radii
        if np.any((x < 0) | (x > w - 1) | (y < 0) | (y > h - 1)):
            raise ValueError("Detection region leaves image; adjust points/radii")
        return cv2.remap(gray, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR)

    middle = sample(angles)
    flank = (sample(angles + math.radians(4)) + sample(angles - math.radians(4))) / 2
    contrast = (flank - middle) * (1 if dc["polarity"] == "dark" else -1)
    scores = np.maximum(contrast, 0).mean(axis=1) * (contrast > 4).mean(axis=1)
    best = int(scores.argmax())
    peak = float(scores[best])
    distant = np.abs(offsets - offsets[best]) > math.radians(9)
    second = float(scores[distant].max()) if distant.any() else 0
    confidence = max(0, min(1, (peak - second) / max(peak, 1))) * min(1, peak / 18)
    valid = confidence >= dc["min_confidence"] and peak >= 4
    ratio = float(offsets[best] / span)
    theta = float(angles[best])

    tip = np.float32([[[cx + math.cos(theta) * radius, cy + math.sin(theta) * radius]]])
    if inverse is not None:
        raw_tip = cv2.perspectiveTransform(tip, inverse)[0, 0]
        needle_point = [round(float(raw_tip[0] / (raw_w - 1)), 6), round(float(raw_tip[1] / (raw_h - 1)), 6)]
    else:
        needle_point = [round(float(tip[0, 0, 0] / raw_w), 6), round(float(tip[0, 0, 1] / raw_h), 6)]

    return {
        "status": "normal" if valid else "error",
        "value": round(dc["min_value"] + ratio * (dc["max_value"] - dc["min_value"]), 3) if valid else None,
        "percent": round(ratio * 100, 2) if valid else None,
        "confidence": round(confidence, 4),
        "needle_point": needle_point,
        "error": None if valid else "low_confidence",
    }
