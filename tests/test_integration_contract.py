from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from gauge import validate


def test_fuel_type_is_first_class():
    cfg = {
        'id':'hosp-0001-fuel-1','camera_id':'1','facility_id':'HOSP-0001','device_id':'fuel-1',
        'name':'非常用発電機 燃料残量','type':'fuel','unit':'L','enabled':True,'is_demo':False,
        'interval_minutes':60,'min_value':0,'max_value':4500,'direction':'cw','polarity':'dark',
        'min_confidence':0.25,'inner_radius':0.30,'outer_radius':0.72,'image_size':[400,300],
        'points':{'min':[0.2,0.6],'center':[0.5,0.8],'max':[0.8,0.6]},
        'perspective_enabled':False,'perspective_points':{}
    }
    assert validate(cfg)['type'] == 'fuel'
