"""Calibrated radial contrast detector. Coordinates are normalized to the image.

The three required calibration points are:
  min    : minimum tick
  center : needle rotation center
  max    : maximum tick

The current needle is detected automatically for every image. Older configs may
still contain points.reference; it is accepted only as a legacy radius hint.
"""
import math
import re
import cv2
import numpy as np


REQUIRED_POINT_KEYS = ("center", "min", "max")


def _valid_point(p):
    return (
        isinstance(p, (list, tuple))
        and len(p) == 2
        and all(type(x) in (int, float) and math.isfinite(x) and 0 <= x <= 1 for x in p)
    )


def validate(c):
    allowed = {"id", "camera_id", "facility_id", "device_id", "name", "type", "unit", "enabled", "is_demo", "interval_minutes", "min_value", "max_value", "direction", "polarity", "min_confidence", "inner_radius", "outer_radius", "image_size", "points"}
    if not isinstance(c, dict) or set(c) != allowed:
        raise ValueError("Unknown or missing config fields; source URLs belong in Secrets")
    for key in ("id", "camera_id", "facility_id", "device_id"):
        if not isinstance(c.get(key), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", c[key]):
            raise ValueError("Invalid identifier: " + key)
    if c.get("type") not in ("water", "generator"):
        raise ValueError("Invalid sensor type")
    if type(c.get("enabled")) is not bool or type(c.get("is_demo")) is not bool:
        raise ValueError("enabled/is_demo must be booleans")
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
    if not isinstance(c.get("unit"), str) or len(c["unit"]) > 20:
        raise ValueError("Invalid unit")
    if not isinstance(c.get("name"), str) or len(c["name"]) > 120:
        raise ValueError("Invalid name")

    points = c.get("points")
    if not isinstance(points, dict):
        raise ValueError("Invalid points")
    for key in REQUIRED_POINT_KEYS:
        if not _valid_point(points.get(key)):
            raise ValueError("Invalid point: " + key)
        if key != "center" and math.dist(points[key], points["center"]) < 0.02:
            raise ValueError("Point too close to center")
    # Backward compatibility: older four-point configs may keep reference.
    if "reference" in points:
        if not _valid_point(points["reference"]):
            raise ValueError("Invalid point: reference")
        if math.dist(points["reference"], points["center"]) < 0.02:
            raise ValueError("Point too close to center")

    size = c.get("image_size", [])
    if len(size) != 2 or any(type(x) is not int or not 16 <= x <= 12000 for x in size):
        raise ValueError("Invalid image size")
    _, span = geometry(c, *size)
    if not math.radians(5) <= span <= math.radians(350):
        raise ValueError("Invalid sweep")
    return c


def geometry(c, w, h):
    p = c["points"]

    def angle(key):
        return math.atan2((p[key][1] - p["center"][1]) * h, (p[key][0] - p["center"][0]) * w)

    sign = 1 if c["direction"] == "cw" else -1
    start = angle("min")
    return start, ((angle("max") - start) * sign) % (2 * math.pi)


def calibration_radius(c, w, h):
    """Return the radial scale used by the detector.

    Legacy four-point configs keep their exact reference radius. New three-point
    configs derive the scale from the minimum/maximum tick radii, so no current
    needle point has to be saved in configuration.
    """
    p = c["points"]
    center = np.array(p["center"], dtype=float)
    scale = np.array([w, h], dtype=float)
    if "reference" in p:
        return float(np.linalg.norm((np.array(p["reference"], dtype=float) - center) * scale))
    tick_radii = [
        float(np.linalg.norm((np.array(p[key], dtype=float) - center) * scale))
        for key in ("min", "max")
    ]
    return float(np.median(tick_radii))


def read_gauge(image, c):
    validate(c)
    if image is None or image.ndim != 3:
        raise ValueError("Invalid image")
    h, w = image.shape[:2]
    if abs(w / h - c["image_size"][0] / c["image_size"][1]) > 0.015:
        raise ValueError("Image aspect ratio changed; recalibration required")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
    cx, cy = np.array(c["points"]["center"]) * [w, h]
    radius = calibration_radius(c, w, h)
    start, span = geometry(c, w, h)
    sign = 1 if c["direction"] == "cw" else -1
    offsets = np.linspace(0, span, max(121, int(math.degrees(span) * 3)))
    angles = start + sign * offsets
    radii = np.linspace(radius * c["inner_radius"], radius * c["outer_radius"], 100)

    def sample(a):
        x = cx + np.cos(a[:, None]) * radii
        y = cy + np.sin(a[:, None]) * radii
        if np.any((x < 0) | (x > w - 1) | (y < 0) | (y > h - 1)):
            raise ValueError("Detection region leaves image; adjust points/radii")
        return cv2.remap(gray, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR)

    middle = sample(angles)
    flank = (sample(angles + math.radians(4)) + sample(angles - math.radians(4))) / 2
    contrast = (flank - middle) * (1 if c["polarity"] == "dark" else -1)
    # Reward contrast sustained along the ray, so text/ticks do not dominate.
    scores = np.maximum(contrast, 0).mean(axis=1) * (contrast > 4).mean(axis=1)
    best = int(scores.argmax())
    peak = float(scores[best])
    distant = np.abs(offsets - offsets[best]) > math.radians(9)
    second = float(scores[distant].max()) if distant.any() else 0
    confidence = max(0, min(1, (peak - second) / max(peak, 1))) * min(1, peak / 18)
    valid = confidence >= c["min_confidence"] and peak >= 4
    ratio = float(offsets[best] / span)
    theta = float(angles[best])

    # needle_point is always derived from the detected angle, never from a saved
    # current-needle calibration point.
    return {
        "status": "normal" if valid else "error",
        "value": round(c["min_value"] + ratio * (c["max_value"] - c["min_value"]), 3) if valid else None,
        "percent": round(ratio * 100, 2) if valid else None,
        "confidence": round(confidence, 4),
        "needle_point": [
            round((cx + math.cos(theta) * radius) / w, 6),
            round((cy + math.sin(theta) * radius) / h, 6),
        ],
        "error": None if valid else "low_confidence",
    }
