"""
Static center information for UCENLIST's two Vipassana meditation centers.
Data sourced from schedule.vridhamma.org and ucenlist.org (June 2026).
"""

CENTERS: dict[str, dict] = {
    "virocana": {
        "name": "Dhamma Virocana",
        "name_vi": "Dhamma Virocana",
        "subtitle": "The Sun of Dhamma",
        "city": "Ha Noi",
        "city_vi": "Hà Nội",
        "address": "Số 15-17 ngõ Sala, đường Đồng Đò, thôn Minh Tân, xã Kim Anh, Hà Nội",
        "phone": "+84 966 894 936",
        "email": "contact.virocana@vridhamma.org",
        "website": "https://virocana.vridhamma.org/vi",
        "schedule_url_vi": "https://schedule.vridhamma.org/vi/courses/virocana",
        "schedule_url_en": "https://schedule.vridhamma.org/courses/virocana",
        "maps_url": "https://maps.app.goo.gl/PsH8cZkwznFiwMU99",
    },
    "vutthi": {
        "name": "Dhamma Vutthi",
        "name_vi": "Dhamma Vutthi",
        "subtitle": "The Monsoon Rain of Dhamma",
        "city": "Ho Chi Minh City",
        "city_vi": "TP. Hồ Chí Minh",
        "address": "112, đường 628, ấp Trại Đèn, Phước Hiệp, Củ Chi, TP. Hồ Chí Minh",
        "phone": "+84 942 255 050",
        "email": "contact.vutthi@vridhamma.org",
        "website": "https://vutthi.vridhamma.org/vi",
        "schedule_url_vi": "https://schedule.vridhamma.org/vi/courses/vutthi",
        "schedule_url_en": "https://schedule.vridhamma.org/courses/vutthi",
        "maps_url": None,
    },
}

# Human-readable aliases
CENTER_ALIASES: dict[str, str] = {
    # Vietnamese
    "hà nội": "virocana",
    "ha noi": "virocana",
    "hanoi": "virocana",
    "hn": "virocana",
    "hồ chí minh": "vutthi",
    "ho chi minh": "vutthi",
    "hcm": "vutthi",
    "tp hcm": "vutthi",
    "sài gòn": "vutthi",
    "sai gon": "vutthi",
    # Center names
    "virocana": "virocana",
    "dhamma virocana": "virocana",
    "vutthi": "vutthi",
    "dhamma vutthi": "vutthi",
}


def resolve_center(name: str) -> str | None:
    """Resolve a center name/alias to its canonical ID ('virocana' or 'vutthi')."""
    return CENTER_ALIASES.get(name.strip().lower())
