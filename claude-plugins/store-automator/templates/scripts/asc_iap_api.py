"""
App Store Connect IAP API layer.

Low-level functions for interacting with the App Store Connect REST API
for subscription groups and subscriptions.
"""
import sys
import time

try:
    import jwt
    import requests
except ImportError:
    import subprocess
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "--break-system-packages", "PyJWT", "cryptography", "requests"],
        stdout=subprocess.DEVNULL,
    )
    import jwt
    import requests

BASE_URL = "https://api.appstoreconnect.apple.com/v1"
TIMEOUT = (10, 30)

# ISO 8601 duration to App Store Connect subscription period mapping
DURATION_MAP = {
    "P1W": "ONE_WEEK",
    "P1M": "ONE_MONTH",
    "P2M": "TWO_MONTHS",
    "P3M": "THREE_MONTHS",
    "P6M": "SIX_MONTHS",
    "P1Y": "ONE_YEAR",
    "ONE_WEEK": "ONE_WEEK",
    "ONE_MONTH": "ONE_MONTH",
    "TWO_MONTHS": "TWO_MONTHS",
    "THREE_MONTHS": "THREE_MONTHS",
    "SIX_MONTHS": "SIX_MONTHS",
    "ONE_YEAR": "ONE_YEAR",
}


def get_jwt_token(key_id: str, issuer_id: str, private_key: str) -> str:
    """Generate a signed JWT for App Store Connect API authentication."""
    payload = {
        "iss": issuer_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + 1200,
        "aud": "appstoreconnect-v1",
    }
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": key_id})


def get_app_id(headers: dict, bundle_id: str) -> str:
    """Look up the App Store Connect app ID for the given bundle identifier."""
    resp = requests.get(
        f"{BASE_URL}/apps",
        params={"filter[bundleId]": bundle_id},
        headers=headers,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json().get("data", [])
    if not data:
        print(f"ERROR: No app found for bundle ID '{bundle_id}'", file=sys.stderr)
        sys.exit(1)
    return data[0]["id"]


def list_subscription_groups(headers: dict, app_id: str) -> list:
    """List all existing subscription groups for the app."""
    resp = requests.get(
        f"{BASE_URL}/apps/{app_id}/subscriptionGroups",
        headers=headers,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("data", [])


def create_subscription_group(headers: dict, app_id: str, reference_name: str) -> str:
    """Create a subscription group and return its ID."""
    resp = requests.post(
        f"{BASE_URL}/subscriptionGroups",
        json={
            "data": {
                "type": "subscriptionGroups",
                "attributes": {"referenceName": reference_name},
                "relationships": {
                    "app": {"data": {"type": "apps", "id": app_id}}
                },
            }
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_errors(resp, f"create subscription group '{reference_name}'")
        sys.exit(1)
    group_id = resp.json()["data"]["id"]
    print(f"  Created subscription group '{reference_name}' (ID: {group_id})")
    return group_id


def list_subscriptions_in_group(headers: dict, group_id: str) -> list:
    """List all subscriptions within a subscription group."""
    resp = requests.get(
        f"{BASE_URL}/subscriptionGroups/{group_id}/subscriptions",
        headers=headers,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("data", [])


def create_subscription(headers: dict, group_id: str, sub_config: dict) -> str:
    """Create a subscription within a group and return its ID."""
    duration = DURATION_MAP.get(sub_config["duration"], sub_config["duration"])
    resp = requests.post(
        f"{BASE_URL}/subscriptions",
        json={
            "data": {
                "type": "subscriptions",
                "attributes": {
                    "productId": sub_config["product_id"],
                    "name": sub_config["reference_name"],
                    "subscriptionPeriod": duration,
                    "groupLevel": sub_config.get("group_level", 1),
                    "familySharable": sub_config.get("family_sharable", False),
                    "reviewNote": sub_config.get("review_note", ""),
                },
                "relationships": {
                    "group": {"data": {"type": "subscriptionGroups", "id": group_id}}
                },
            }
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_errors(resp, f"create subscription '{sub_config['product_id']}'")
        sys.exit(1)
    sub_id = resp.json()["data"]["id"]
    print(f"    Created subscription '{sub_config['product_id']}' (ID: {sub_id})")
    return sub_id


def get_subscription_localizations(headers: dict, sub_id: str) -> list:
    """Fetch existing localizations for a subscription."""
    resp = requests.get(
        f"{BASE_URL}/subscriptions/{sub_id}/subscriptionLocalizations",
        headers=headers,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("data", [])


def create_localization(headers: dict, sub_id: str, locale: str, loc_data: dict) -> None:
    """Create a new localization for a subscription."""
    resp = requests.post(
        f"{BASE_URL}/subscriptionLocalizations",
        json={
            "data": {
                "type": "subscriptionLocalizations",
                "attributes": {
                    "locale": locale,
                    "name": loc_data.get("name", ""),
                    "description": loc_data.get("description", ""),
                },
                "relationships": {
                    "subscription": {"data": {"type": "subscriptions", "id": sub_id}}
                },
            }
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_errors(resp, f"create localization '{locale}' for subscription {sub_id}")
        return
    print(f"      Created localization '{locale}'")


def update_localization(headers: dict, loc_id: str, loc_data: dict) -> None:
    """Update an existing subscription localization."""
    resp = requests.patch(
        f"{BASE_URL}/subscriptionLocalizations/{loc_id}",
        json={
            "data": {
                "type": "subscriptionLocalizations",
                "id": loc_id,
                "attributes": {
                    "name": loc_data.get("name", ""),
                    "description": loc_data.get("description", ""),
                },
            }
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_errors(resp, f"update localization {loc_id}")
        return
    print(f"      Updated localization (ID: {loc_id})")


def print_api_errors(resp, action: str) -> None:
    """Print human-readable API error messages."""
    try:
        errors = resp.json().get("errors", [])
        for err in errors:
            detail = err.get("detail", err.get("title", "Unknown error"))
            print(f"ERROR ({action}): {detail}", file=sys.stderr)
    except (ValueError, KeyError):
        print(f"ERROR ({action}): HTTP {resp.status_code} - {resp.text[:200]}", file=sys.stderr)
