#!/usr/bin/env python3
"""
App Store Connect app setup: content rights and pricing.

Sets the content rights declaration and configures free (or paid) pricing
via the App Store Connect API.

Required env vars:
  APP_STORE_CONNECT_KEY_IDENTIFIER  - Key ID from App Store Connect
  APP_STORE_CONNECT_ISSUER_ID       - Issuer ID from App Store Connect
  APP_STORE_CONNECT_PRIVATE_KEY     - Contents of the P8 key file
  BUNDLE_ID                         - App bundle identifier

Optional env vars:
  PRICE_TIER                        - Price tier (default: "0" for free)
  CONTENT_RIGHTS_THIRD_PARTY        - "true" if app uses third-party content (default: "false")

Exit codes:
  0 - Setup completed successfully
  1 - Any failure (missing env vars, API error, etc.)
"""
import os
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


def get_jwt_token(key_id: str, issuer_id: str, private_key: str) -> str:
    """Generate a signed JWT for App Store Connect API authentication."""
    now = int(time.time())
    payload = {
        "iss": issuer_id,
        "iat": now,
        "exp": now + 1200,
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


def print_api_errors(resp, action: str) -> None:
    """Print human-readable API error messages."""
    try:
        errors = resp.json().get("errors", [])
        for err in errors:
            detail = err.get("detail", err.get("title", "Unknown error"))
            print(f"ERROR ({action}): {detail}", file=sys.stderr)
    except (ValueError, KeyError):
        print(f"ERROR ({action}): HTTP {resp.status_code} - {resp.text[:200]}", file=sys.stderr)


def set_content_rights(headers: dict, app_id: str, uses_third_party: bool) -> None:
    """Set the content rights declaration on the app."""
    desired = "USES_THIRD_PARTY_CONTENT" if uses_third_party else "DOES_NOT_USE_THIRD_PARTY_CONTENT"

    resp = requests.get(f"{BASE_URL}/apps/{app_id}", headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    current = resp.json()["data"]["attributes"].get("contentRightsDeclaration")

    if current == desired:
        print(f"  Content rights already set to '{desired}', skipping.")
        return

    patch_resp = requests.patch(
        f"{BASE_URL}/apps/{app_id}",
        json={
            "data": {
                "type": "apps",
                "id": app_id,
                "attributes": {"contentRightsDeclaration": desired},
            }
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    if not patch_resp.ok:
        print_api_errors(patch_resp, "set content rights")
        sys.exit(1)
    print(f"  Content rights set to '{desired}'.")


def get_app_price_points(headers: dict, app_id: str, territory: str = "USA") -> list:
    """Fetch all price points for the app in the given territory, with pagination."""
    url = f"{BASE_URL}/apps/{app_id}/appPricePoints"
    params = {"filter[territory]": territory, "limit": 200}
    all_points = []

    while url:
        resp = requests.get(url, params=params, headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()
        body = resp.json()
        all_points.extend(body.get("data", []))
        url = body.get("links", {}).get("next")
        params = None

    return all_points


def find_price_point_for_tier(price_points: list, tier: int = 0) -> str:
    """Find the price point ID matching the given tier. Tier 0 = free."""
    if tier == 0:
        for pp in price_points:
            price = pp.get("attributes", {}).get("customerPrice", "")
            if price in ("0", "0.0", "0.00"):
                return pp["id"]
        print("ERROR: Could not find a free (tier 0) price point.", file=sys.stderr)
        sys.exit(1)

    for pp in price_points:
        price = pp.get("attributes", {}).get("customerPrice", "")
        try:
            if float(price) > 0 and pp.get("attributes", {}).get("priceTier") == str(tier):
                return pp["id"]
        except (ValueError, TypeError):
            continue
    print(f"ERROR: Could not find price point for tier {tier}.", file=sys.stderr)
    sys.exit(1)


def _is_pricing_set(headers: dict, app_id: str, price_tier: int) -> bool:
    """Check if the app already has pricing set for the given tier."""
    schedule_resp = requests.get(
        f"{BASE_URL}/apps/{app_id}/appPriceSchedule",
        params={"include": "manualPrices,baseTerritory"},
        headers=headers,
        timeout=TIMEOUT,
    )
    if not schedule_resp.ok:
        return False

    included = schedule_resp.json().get("included", [])
    for item in included:
        if item.get("type") == "appPrices":
            existing_price = item.get("attributes", {}).get("customerPrice", "")
            if price_tier == 0 and existing_price in ("0", "0.0", "0.00"):
                return True
    return False


def _create_price_schedule(headers: dict, app_id: str, price_point_id: str) -> requests.Response:
    """POST a new app price schedule and return the response."""
    price_ref_id = "${price-usa}"
    return requests.post(
        f"{BASE_URL}/appPriceSchedules",
        json={
            "data": {
                "type": "appPriceSchedules",
                "relationships": {
                    "app": {"data": {"type": "apps", "id": app_id}},
                    "baseTerritory": {"data": {"type": "territories", "id": "USA"}},
                    "manualPrices": {"data": [{"type": "appPrices", "id": price_ref_id}]},
                },
            },
            "included": [
                {
                    "type": "appPrices",
                    "id": price_ref_id,
                    "attributes": {"startDate": None},
                    "relationships": {
                        "appPricePoint": {
                            "data": {"type": "appPricePoints", "id": price_point_id}
                        }
                    },
                }
            ],
        },
        headers=headers,
        timeout=TIMEOUT,
    )


def set_app_pricing(headers: dict, app_id: str, price_tier: int = 0) -> None:
    """Set the app price schedule. Handles idempotency via pre-check and 409 Conflict."""
    if _is_pricing_set(headers, app_id, price_tier):
        print("  Pricing already set to free, skipping.")
        return

    print(f"  Fetching price points for USA territory...")
    price_points = get_app_price_points(headers, app_id, territory="USA")
    if not price_points:
        print("ERROR: No price points returned for USA territory.", file=sys.stderr)
        sys.exit(1)

    pp_id = find_price_point_for_tier(price_points, tier=price_tier)
    print(f"  Found price point ID: {pp_id}")

    post_resp = _create_price_schedule(headers, app_id, pp_id)
    tier_label = "Free" if price_tier == 0 else f"Tier {price_tier}"

    if post_resp.status_code == 409:
        print(f"  Pricing already set ({tier_label}), skipping (409 Conflict).")
        return
    if not post_resp.ok:
        print_api_errors(post_resp, "set app pricing")
        sys.exit(1)
    print(f"  Pricing set to {tier_label}.")


def main() -> None:
    key_id = os.environ.get("APP_STORE_CONNECT_KEY_IDENTIFIER", "")
    issuer_id = os.environ.get("APP_STORE_CONNECT_ISSUER_ID", "")
    private_key = os.environ.get("APP_STORE_CONNECT_PRIVATE_KEY", "")
    bundle_id = os.environ.get("BUNDLE_ID", "")
    price_tier_str = os.environ.get("PRICE_TIER", "0")
    third_party_str = os.environ.get("CONTENT_RIGHTS_THIRD_PARTY", "false")

    missing = []
    if not key_id:
        missing.append("APP_STORE_CONNECT_KEY_IDENTIFIER")
    if not issuer_id:
        missing.append("APP_STORE_CONNECT_ISSUER_ID")
    if not private_key:
        missing.append("APP_STORE_CONNECT_PRIVATE_KEY")
    if not bundle_id:
        missing.append("BUNDLE_ID")
    if missing:
        print(f"ERROR: Missing required environment variables: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    try:
        price_tier = int(price_tier_str)
    except ValueError:
        print(f"ERROR: PRICE_TIER must be an integer, got '{price_tier_str}'", file=sys.stderr)
        sys.exit(1)

    uses_third_party = third_party_str.lower() == "true"

    token = get_jwt_token(key_id, issuer_id, private_key)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    print(f"Looking up app for bundle ID '{bundle_id}'...")
    app_id = get_app_id(headers, bundle_id)
    print(f"Found app ID: {app_id}")

    print("Setting content rights declaration...")
    set_content_rights(headers, app_id, uses_third_party)

    print("Setting app pricing...")
    set_app_pricing(headers, app_id, price_tier)

    print("App setup complete.")


if __name__ == "__main__":
    main()
