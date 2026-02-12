"""
App Store Connect Subscription Setup API layer.

Functions for managing subscription availability (territories),
pricing (price points), and review screenshot uploads.
"""
import sys

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "--break-system-packages", "requests"],
        stdout=subprocess.DEVNULL,
    )
    import requests

from asc_iap_api import BASE_URL, TIMEOUT, print_api_errors


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

def get_subscription_availability(headers: dict, sub_id: str) -> dict | None:
    """Fetch current availability settings for a subscription."""
    resp = requests.get(
        f"{BASE_URL}/subscriptions/{sub_id}/subscriptionAvailability",
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        if resp.status_code == 404:
            return None
        print_api_errors(resp, f"get availability for subscription {sub_id}")
        return None
    return resp.json().get("data")


def create_subscription_availability(
    headers: dict,
    sub_id: str,
    territory_ids: list[str],
    available_in_new: bool = True,
) -> dict | None:
    """Create availability with specified territories for a subscription."""
    territory_data = [
        {"type": "territories", "id": tid} for tid in territory_ids
    ]
    resp = requests.post(
        f"{BASE_URL}/subscriptionAvailabilities",
        json={
            "data": {
                "type": "subscriptionAvailabilities",
                "attributes": {
                    "availableInNewTerritories": available_in_new,
                },
                "relationships": {
                    "subscription": {
                        "data": {"type": "subscriptions", "id": sub_id},
                    },
                    "availableTerritories": {
                        "data": territory_data,
                    },
                },
            }
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_errors(resp, f"create availability for subscription {sub_id}")
        return None
    print(f"    Set availability for subscription {sub_id} ({len(territory_ids)} territories)")
    return resp.json().get("data")


# ---------------------------------------------------------------------------
# Pricing
# ---------------------------------------------------------------------------

def get_subscription_prices(headers: dict, sub_id: str) -> list:
    """List existing prices for a subscription."""
    resp = requests.get(
        f"{BASE_URL}/subscriptions/{sub_id}/prices",
        params={"include": "subscriptionPricePoint"},
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_errors(resp, f"get prices for subscription {sub_id}")
        return []
    return resp.json().get("data", [])


def get_price_points_for_territory(
    headers: dict, sub_id: str, territory: str,
) -> list:
    """Get available price points for a subscription in a given territory."""
    resp = requests.get(
        f"{BASE_URL}/subscriptions/{sub_id}/pricePoints",
        params={
            "filter[territory]": territory,
            "include": "territory",
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_errors(resp, f"get price points for {territory}")
        return []
    return resp.json().get("data", [])


def find_price_point_by_amount(
    price_points: list, amount_str: str,
) -> dict | None:
    """Find a price point matching the given customer price (numeric comparison).

    Apple's API may return prices with trailing zeros (e.g. "9.990" instead
    of "9.99"), so we compare as floats with a small tolerance rather than
    doing an exact string match.
    """
    for pp in price_points:
        customer_price = pp.get("attributes", {}).get("customerPrice", "")
        try:
            api_price = float(customer_price)
            target_price = float(amount_str)
            if abs(api_price - target_price) < 0.01:
                return pp
        except (ValueError, TypeError):
            continue
    return None


def create_subscription_price(
    headers: dict,
    sub_id: str,
    price_point_id: str,
    start_date: str | None = None,
) -> dict | None:
    """Create a price entry for a subscription using a price point ID."""
    resp = requests.post(
        f"{BASE_URL}/subscriptionPrices",
        json={
            "data": {
                "type": "subscriptionPrices",
                "attributes": {
                    "startDate": start_date,
                    "preserveCurrentPrice": False,
                },
                "relationships": {
                    "subscription": {
                        "data": {"type": "subscriptions", "id": sub_id},
                    },
                    "subscriptionPricePoint": {
                        "data": {
                            "type": "subscriptionPricePoints",
                            "id": price_point_id,
                        },
                    },
                },
            }
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_errors(resp, f"create price for subscription {sub_id}")
        return None
    print(f"    Set price for subscription {sub_id} (price point: {price_point_id})")
    return resp.json().get("data")


# ---------------------------------------------------------------------------
# Review Screenshot
# ---------------------------------------------------------------------------

def get_review_screenshot(headers: dict, sub_id: str) -> dict | None:
    """Fetch the current review screenshot for a subscription."""
    resp = requests.get(
        f"{BASE_URL}/subscriptions/{sub_id}/appStoreReviewScreenshot",
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        if resp.status_code == 404:
            return None
        print_api_errors(resp, f"get review screenshot for subscription {sub_id}")
        return None
    return resp.json().get("data")


def reserve_review_screenshot(
    headers: dict, sub_id: str, file_name: str, file_size: int,
) -> dict | None:
    """Reserve a review screenshot upload slot for a subscription."""
    resp = requests.post(
        f"{BASE_URL}/subscriptionAppStoreReviewScreenshots",
        json={
            "data": {
                "type": "subscriptionAppStoreReviewScreenshots",
                "attributes": {
                    "fileName": file_name,
                    "fileSize": file_size,
                },
                "relationships": {
                    "subscription": {
                        "data": {"type": "subscriptions", "id": sub_id},
                    },
                },
            }
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_errors(resp, f"reserve screenshot for subscription {sub_id}")
        return None
    return resp.json().get("data")


def upload_screenshot_chunks(
    upload_operations: list, file_data: bytes,
) -> bool:
    """Upload binary chunks to pre-signed URLs (no Authorization header)."""
    for op in upload_operations:
        url = op["url"]
        offset = op["offset"]
        length = op["length"]
        chunk = file_data[offset : offset + length]
        op_headers = {h["name"]: h["value"] for h in op.get("requestHeaders", [])}
        resp = requests.put(url, headers=op_headers, data=chunk, timeout=TIMEOUT)
        if not resp.ok:
            print(
                f"ERROR (upload chunk at offset {offset}): "
                f"HTTP {resp.status_code} - {resp.text[:200]}",
                file=sys.stderr,
            )
            return False
    return True


def commit_review_screenshot(
    headers: dict, screenshot_id: str, md5_checksum: str,
) -> dict | None:
    """Commit an uploaded review screenshot by confirming its checksum."""
    resp = requests.patch(
        f"{BASE_URL}/subscriptionAppStoreReviewScreenshots/{screenshot_id}",
        json={
            "data": {
                "type": "subscriptionAppStoreReviewScreenshots",
                "id": screenshot_id,
                "attributes": {
                    "sourceFileChecksum": md5_checksum,
                    "uploaded": True,
                },
            }
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_errors(resp, f"commit screenshot {screenshot_id}")
        return None
    print(f"    Committed review screenshot (ID: {screenshot_id})")
    return resp.json().get("data")
