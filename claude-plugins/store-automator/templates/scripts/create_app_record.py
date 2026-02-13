#!/usr/bin/env python3
"""
Ensure an App Store Connect app exists with correct configuration.

Fully idempotent flow:
  1. Register Bundle ID on the Developer Portal (skip if exists)
  2. Create App Record in App Store Connect (skip if exists)
  3. Set content rights declaration (via asc_app_setup)
  4. Set app pricing schedule (via asc_app_setup)

Required env vars:
  APP_STORE_CONNECT_KEY_IDENTIFIER  - Key ID from App Store Connect
  APP_STORE_CONNECT_ISSUER_ID       - Issuer ID from App Store Connect
  APP_STORE_CONNECT_PRIVATE_KEY     - Contents of the P8 key file
  BUNDLE_ID                         - App bundle identifier (e.g. com.daemux.gigachat)
  APP_NAME                          - Display name for the app
  SKU                               - Unique SKU string (defaults to BUNDLE_ID)

Optional env vars:
  PLATFORM                          - "IOS" or "UNIVERSAL" (default: "IOS")
  CONTENT_RIGHTS_THIRD_PARTY        - "true" if app uses third-party content (default: "false")
  PRICE_TIER                        - Price tier integer (default: "0" for free)

Exit codes:
  0 - App ready (created or already existed)
  1 - Any failure (missing env vars, API error, etc.)
"""
import json
import os
import sys
import time

try:
    import jwt
    import requests
except ImportError:
    print("Installing dependencies...", file=sys.stderr)
    import subprocess
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "--break-system-packages", "PyJWT", "cryptography", "requests"],
        stdout=subprocess.DEVNULL,
    )
    import jwt
    import requests

# Import content rights and pricing from asc_app_setup (same directory)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_app_setup import print_api_errors, set_content_rights, set_app_pricing  # noqa: E402

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


def ensure_bundle_id(headers: dict, bundle_id: str, app_name: str, platform: str) -> str:
    """Register a Bundle ID if it does not exist. Returns the resource ID."""
    resp = requests.get(
        f"{BASE_URL}/bundleIds",
        params={"filter[identifier]": bundle_id},
        headers=headers,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json().get("data", [])
    if data:
        resource_id = data[0]["id"]
        print(f"  Bundle ID already registered: {resource_id}")
        return resource_id

    print(f"  Registering new Bundle ID '{bundle_id}' (platform: {platform})...")
    post_resp = requests.post(
        f"{BASE_URL}/bundleIds",
        json={
            "data": {
                "type": "bundleIds",
                "attributes": {
                    "identifier": bundle_id,
                    "name": app_name,
                    "platform": platform,
                },
            }
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    if post_resp.status_code == 409:
        print("  Bundle ID already exists (409 Conflict), re-fetching...")
        return _refetch_bundle_id(headers, bundle_id)
    if not post_resp.ok:
        print_api_errors(post_resp, "register bundle ID")
        sys.exit(1)
    resource_id = post_resp.json()["data"]["id"]
    print(f"  Bundle ID registered: {resource_id}")
    return resource_id


def _refetch_bundle_id(headers: dict, bundle_id: str) -> str:
    """Re-fetch a bundle ID resource after a 409 conflict."""
    resp = requests.get(
        f"{BASE_URL}/bundleIds",
        params={"filter[identifier]": bundle_id},
        headers=headers,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json().get("data", [])
    if not data:
        print(f"ERROR: Bundle ID '{bundle_id}' not found after 409 conflict.", file=sys.stderr)
        sys.exit(1)
    return data[0]["id"]


def _lookup_existing_app(headers: dict, bundle_id: str) -> dict | None:
    """Look up an existing app by bundle ID. Returns app data dict or None."""
    resp = requests.get(
        f"{BASE_URL}/apps",
        params={"filter[bundleId]": bundle_id},
        headers=headers,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json().get("data", [])
    return data[0] if data else None


def create_app_record(
    headers: dict,
    bundle_id: str,
    bundle_id_resource_id: str,
    app_name: str,
    sku: str,
) -> dict:
    """Create or retrieve an existing app record in App Store Connect."""
    existing = _lookup_existing_app(headers, bundle_id)
    if existing:
        app_info = {
            "app_id": existing["id"],
            "name": existing["attributes"]["name"],
            "bundle_id": existing["attributes"]["bundleId"],
            "sku": existing["attributes"]["sku"],
        }
        print(f"  App already exists: {json.dumps(app_info)}")
        return existing

    payload = {
        "data": {
            "type": "apps",
            "attributes": {
                "bundleId": bundle_id,
                "name": app_name,
                "sku": sku,
                "primaryLocale": "en-US",
            },
            "relationships": {
                "bundleId": {
                    "data": {"type": "bundleIds", "id": bundle_id_resource_id}
                }
            },
        }
    }
    resp = requests.post(f"{BASE_URL}/apps", json=payload, headers=headers, timeout=TIMEOUT)
    if resp.status_code == 409:
        print("  App creation returned 409, fetching existing record...")
        existing = _lookup_existing_app(headers, bundle_id)
        if existing:
            return existing
        print("ERROR: App creation returned 409 but app not found.", file=sys.stderr)
        sys.exit(1)
    if not resp.ok:
        print_api_errors(resp, "create app record")
        sys.exit(1)
    return resp.json()["data"]


def validate_env_vars() -> dict:
    """Validate and return all required/optional env vars as a dict."""
    key_id = os.environ.get("APP_STORE_CONNECT_KEY_IDENTIFIER", "")
    issuer_id = os.environ.get("APP_STORE_CONNECT_ISSUER_ID", "")
    private_key = os.environ.get("APP_STORE_CONNECT_PRIVATE_KEY", "")
    bundle_id = os.environ.get("BUNDLE_ID", "")
    app_name = os.environ.get("APP_NAME", "")
    sku = os.environ.get("SKU", "") or bundle_id

    required = {
        "APP_STORE_CONNECT_KEY_IDENTIFIER": key_id,
        "APP_STORE_CONNECT_ISSUER_ID": issuer_id,
        "APP_STORE_CONNECT_PRIVATE_KEY": private_key,
        "BUNDLE_ID": bundle_id,
        "APP_NAME": app_name,
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        print(f"ERROR: Missing required environment variables: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    platform = os.environ.get("PLATFORM", "IOS")
    if platform not in ("IOS", "UNIVERSAL"):
        print(f"ERROR: PLATFORM must be 'IOS' or 'UNIVERSAL', got '{platform}'", file=sys.stderr)
        sys.exit(1)

    price_tier_str = os.environ.get("PRICE_TIER", "0")
    try:
        price_tier = int(price_tier_str)
    except ValueError:
        print(f"ERROR: PRICE_TIER must be an integer, got '{price_tier_str}'", file=sys.stderr)
        sys.exit(1)

    return {
        "key_id": key_id, "issuer_id": issuer_id, "private_key": private_key,
        "bundle_id": bundle_id, "app_name": app_name, "sku": sku,
        "platform": platform, "price_tier": price_tier,
        "uses_third_party": os.environ.get("CONTENT_RIGHTS_THIRD_PARTY", "false").lower() == "true",
    }


def main() -> None:
    """Orchestrate the full app creation and configuration flow."""
    cfg = validate_env_vars()
    token = get_jwt_token(cfg["key_id"], cfg["issuer_id"], cfg["private_key"])
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    print(f"Step 1: Ensuring Bundle ID '{cfg['bundle_id']}' is registered...")
    bundle_id_resource_id = ensure_bundle_id(headers, cfg["bundle_id"], cfg["app_name"], cfg["platform"])

    print(f"Step 2: Ensuring app record '{cfg['app_name']}' (SKU: {cfg['sku']}) exists...")
    app_data = create_app_record(headers, cfg["bundle_id"], bundle_id_resource_id, cfg["app_name"], cfg["sku"])
    app_id = app_data["id"]
    print(f"  App ID: {app_id}")

    print("Step 3: Setting content rights declaration...")
    set_content_rights(headers, app_id, cfg["uses_third_party"])

    print("Step 4: Setting app pricing...")
    set_app_pricing(headers, app_id, cfg["price_tier"])

    print(f"All done. App '{cfg['app_name']}' ({cfg['bundle_id']}) is ready.")


if __name__ == "__main__":
    main()
