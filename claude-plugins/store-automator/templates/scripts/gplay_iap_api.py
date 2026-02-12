"""
Google Play IAP API layer.

Low-level functions for interacting with the Android Publisher API
for subscriptions, base plans, and offers.
"""
import json
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

API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
TIMEOUT = (10, 30)

# ISO 8601 duration mapping (normalize to ISO 8601 for Google Play)
DURATION_MAP = {
    "ONE_WEEK": "P1W",
    "ONE_MONTH": "P1M",
    "TWO_MONTHS": "P2M",
    "THREE_MONTHS": "P3M",
    "SIX_MONTHS": "P6M",
    "ONE_YEAR": "P1Y",
}

# Regions version required by the API
REGIONS_VERSION = {"version": "2022/02"}


def get_access_token(sa_path: str) -> str:
    """Obtain an OAuth2 access token using the service account credentials."""
    with open(sa_path, "r", encoding="utf-8") as fh:
        sa = json.load(fh)
    now = int(time.time())
    payload = {
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/androidpublisher",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }
    signed = jwt.encode(payload, sa["private_key"], algorithm="RS256")
    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": signed},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def list_subscriptions(headers: dict, package_name: str) -> dict:
    """List all existing subscriptions. Returns a dict keyed by productId."""
    resp = requests.get(
        f"{API_BASE}/{package_name}/subscriptions",
        headers=headers,
        timeout=TIMEOUT,
    )
    if resp.status_code == 404:
        return {}
    resp.raise_for_status()
    if not resp.text.strip():
        return {}
    subs = resp.json().get("subscriptions", [])
    return {s["productId"]: s for s in subs}


def normalize_duration(duration: str) -> str:
    """Normalize duration to ISO 8601 format accepted by Google Play."""
    return DURATION_MAP.get(duration, duration)


def build_price(price_str: str, currency: str = "USD") -> dict:
    """Build a Money object from a decimal price string like '9.99'."""
    parts = price_str.split(".")
    units = parts[0]
    nanos = 0
    if len(parts) > 1:
        frac = parts[1].ljust(9, "0")[:9]
        nanos = int(frac)
    return {"currencyCode": currency, "units": units, "nanos": nanos}


def currency_to_region(currency: str) -> str:
    """Map common currency codes to region codes."""
    mapping = {
        "USD": "US",
        "EUR": "DE",
        "GBP": "GB",
        "JPY": "JP",
        "CAD": "CA",
        "AUD": "AU",
    }
    return mapping.get(currency, "")


def create_subscription(headers: dict, package_name: str, product_id: str, body: dict) -> dict:
    """Create a new subscription via the API."""
    resp = requests.post(
        f"{API_BASE}/{package_name}/subscriptions",
        params={"productId": product_id, "regionsVersion.version": REGIONS_VERSION["version"]},
        json=body,
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_error(resp, f"create subscription '{product_id}'")
        return {}

    print(f"    Created subscription '{product_id}'")
    return resp.json()


def update_subscription(headers: dict, package_name: str, product_id: str, body: dict) -> dict:
    """Update an existing subscription via the API."""
    resp = requests.patch(
        f"{API_BASE}/{package_name}/subscriptions/{product_id}",
        params={
            "updateMask": "listings",
            "regionsVersion.version": REGIONS_VERSION["version"],
        },
        json=body,
        headers=headers,
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_error(resp, f"update subscription '{product_id}'")
        return {}

    print(f"    Updated subscription '{product_id}'")
    return resp.json()


def activate_base_plan(headers: dict, package_name: str, product_id: str, base_plan_id: str) -> bool:
    """Activate a base plan for a subscription."""
    resp = requests.post(
        f"{API_BASE}/{package_name}/subscriptions/{product_id}/basePlans/{base_plan_id}:activate",
        headers=headers,
        json={},
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print_api_error(resp, f"activate base plan '{base_plan_id}'")
        return False
    print(f"      Activated base plan '{base_plan_id}'")
    return True


def create_intro_offer(
    headers: dict, package_name: str, product_id: str, base_plan_id: str, offer_id: str, body: dict
) -> bool:
    """Create an introductory offer (free trial) for a base plan."""
    resp = requests.post(
        f"{API_BASE}/{package_name}/subscriptions/{product_id}"
        f"/basePlans/{base_plan_id}/offers",
        params={"offerId": offer_id, "regionsVersion.version": REGIONS_VERSION["version"]},
        json=body,
        headers=headers,
        timeout=TIMEOUT,
    )
    if resp.status_code == 409:
        print(f"      Intro offer '{offer_id}' already exists")
        return True
    if not resp.ok:
        print_api_error(resp, f"create intro offer for '{product_id}'")
        return False

    print(f"      Created intro offer '{offer_id}'")
    return True


def print_api_error(resp, action: str) -> None:
    """Print human-readable API error messages."""
    try:
        error_data = resp.json()
        message = error_data.get("error", {}).get("message", resp.text[:200])
        print(f"ERROR ({action}): {message}", file=sys.stderr)
    except (ValueError, KeyError):
        print(f"ERROR ({action}): HTTP {resp.status_code} - {resp.text[:200]}", file=sys.stderr)
