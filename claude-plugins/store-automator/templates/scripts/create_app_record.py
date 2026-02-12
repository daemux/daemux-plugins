#!/usr/bin/env python3
"""
Create an App Store Connect app record via the direct API.

Looks up the Bundle ID resource, then creates a new app record
with the specified name, SKU, and primary locale.

Required env vars:
  APP_STORE_CONNECT_KEY_IDENTIFIER  - Key ID from App Store Connect
  APP_STORE_CONNECT_ISSUER_ID       - Issuer ID from App Store Connect
  APP_STORE_CONNECT_PRIVATE_KEY     - Contents of the P8 key file
  BUNDLE_ID                         - App bundle identifier (e.g. com.daemux.gigachat)
  APP_NAME                          - Display name for the app
  SKU                               - Unique SKU string for the app

Exit codes:
  0 - App record created successfully
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
    return jwt.encode(
        payload, private_key, algorithm="ES256", headers={"kid": key_id}
    )


def lookup_bundle_id_resource(headers: dict, bundle_id: str) -> str:
    """Look up the Bundle ID resource ID for the given identifier."""
    resp = requests.get(
        f"{BASE_URL}/bundleIds",
        params={"filter[identifier]": bundle_id},
        headers=headers,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json().get("data", [])
    if not data:
        print(
            f"ERROR: No Bundle ID found for identifier '{bundle_id}'. "
            "Register it in App Store Connect > Certificates, Identifiers & Profiles first.",
            file=sys.stderr,
        )
        sys.exit(1)
    return data[0]["id"]


def create_app_record(
    headers: dict,
    bundle_id: str,
    bundle_id_resource_id: str,
    app_name: str,
    sku: str,
) -> dict:
    """Create a new app record in App Store Connect."""
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
                    "data": {
                        "type": "bundleIds",
                        "id": bundle_id_resource_id,
                    }
                }
            },
        }
    }
    resp = requests.post(
        f"{BASE_URL}/apps",
        json=payload,
        headers=headers,
        timeout=TIMEOUT,
    )
    if resp.status_code == 409:
        print(
            f"ERROR: An app with bundle ID '{bundle_id}' already exists.",
            file=sys.stderr,
        )
        sys.exit(1)
    if not resp.ok:
        errors = resp.json().get("errors", [])
        for err in errors:
            print(f"ERROR: {err.get('detail', err.get('title', 'Unknown'))}", file=sys.stderr)
        sys.exit(1)
    return resp.json()["data"]


def main() -> None:
    key_id = os.environ.get("APP_STORE_CONNECT_KEY_IDENTIFIER", "")
    issuer_id = os.environ.get("APP_STORE_CONNECT_ISSUER_ID", "")
    private_key = os.environ.get("APP_STORE_CONNECT_PRIVATE_KEY", "")
    bundle_id = os.environ.get("BUNDLE_ID", "")
    app_name = os.environ.get("APP_NAME", "")
    sku = os.environ.get("SKU", "")

    missing = []
    if not key_id:
        missing.append("APP_STORE_CONNECT_KEY_IDENTIFIER")
    if not issuer_id:
        missing.append("APP_STORE_CONNECT_ISSUER_ID")
    if not private_key:
        missing.append("APP_STORE_CONNECT_PRIVATE_KEY")
    if not bundle_id:
        missing.append("BUNDLE_ID")
    if not app_name:
        missing.append("APP_NAME")
    if not sku:
        missing.append("SKU")

    if missing:
        print(f"ERROR: Missing required environment variables: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    token = get_jwt_token(key_id, issuer_id, private_key)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    print(f"Looking up Bundle ID resource for '{bundle_id}'...")
    bundle_id_resource_id = lookup_bundle_id_resource(headers, bundle_id)
    print(f"Found Bundle ID resource: {bundle_id_resource_id}")

    print(f"Creating app record '{app_name}' (SKU: {sku})...")
    app_data = create_app_record(headers, bundle_id, bundle_id_resource_id, app_name, sku)

    result = {
        "app_id": app_data["id"],
        "name": app_data["attributes"]["name"],
        "bundle_id": app_data["attributes"]["bundleId"],
        "sku": app_data["attributes"]["sku"],
    }
    print(f"App record created successfully: {json.dumps(result)}")


if __name__ == "__main__":
    main()
