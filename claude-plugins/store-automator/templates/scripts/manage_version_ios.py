#!/usr/bin/env python3
"""
Automatic iOS version management via App Store Connect API.
Queries the latest app version and decides whether to create a new version or reuse existing.

State logic:
  READY_FOR_SALE            -> create new version (auto-increment patch)
  PREPARE_FOR_SUBMISSION    -> reuse existing version
  WAITING_FOR_REVIEW        -> reuse existing version
  IN_REVIEW                 -> reuse existing version
  REJECTED                  -> reuse existing version
  PENDING_DEVELOPER_RELEASE -> error (must manually release first)
  No versions exist         -> create version 1.0.0

Version increment uses base-10 rollover: 1.0.9 -> 1.1.0, 1.9.9 -> 2.0.0

Required env vars:
  APP_STORE_CONNECT_KEY_IDENTIFIER  - Key ID from App Store Connect
  APP_STORE_CONNECT_ISSUER_ID       - Issuer ID from App Store Connect
  APP_STORE_CONNECT_PRIVATE_KEY     - Contents of the P8 key file
  BUNDLE_ID                         - App bundle identifier
"""
import os
import sys
import json
import time

try:
    import jwt
    import requests
except ImportError:
    print("Installing dependencies...", file=sys.stderr)
    import subprocess
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "--break-system-packages",
        "PyJWT", "cryptography", "requests"
    ], stdout=subprocess.DEVNULL)
    import jwt
    import requests

BASE_URL = "https://api.appstoreconnect.apple.com/v1"


def get_jwt_token(key_id, issuer_id, private_key):
    payload = {
        "iss": issuer_id,
        "exp": int(time.time()) + 1200,
        "aud": "appstoreconnect-v1",
    }
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": key_id})


def get_app_id(headers, bundle_id):
    resp = requests.get(
        f"{BASE_URL}/apps",
        params={"filter[bundleId]": bundle_id},
        headers=headers,
        timeout=(10, 30),
    )
    resp.raise_for_status()
    data = resp.json().get("data", [])
    if not data:
        print(f"ERROR: No app found for bundle ID {bundle_id}", file=sys.stderr)
        sys.exit(1)
    return data[0]["id"]


def get_versions(headers, app_id):
    resp = requests.get(
        f"{BASE_URL}/apps/{app_id}/appStoreVersions",
        headers=headers,
        timeout=(10, 30),
    )
    resp.raise_for_status()
    return resp.json().get("data", [])


def increment_version(version_str):
    parts = version_str.split(".")
    major = int(parts[0])
    minor = int(parts[1]) if len(parts) > 1 else 0
    micro = int(parts[2]) if len(parts) > 2 else 0
    micro += 1
    if micro >= 10:
        micro, minor = 0, minor + 1
    if minor >= 10:
        minor, major = 0, major + 1
    return f"{major}.{minor}.{micro}"


def create_version(headers, app_id, version_string):
    resp = requests.post(
        f"{BASE_URL}/appStoreVersions",
        json={
            "data": {
                "type": "appStoreVersions",
                "attributes": {
                    "platform": "IOS",
                    "versionString": version_string,
                    "releaseType": "AFTER_APPROVAL",
                },
                "relationships": {
                    "app": {"data": {"type": "apps", "id": app_id}}
                },
            }
        },
        headers=headers,
        timeout=(10, 30),
    )
    resp.raise_for_status()
    return resp.json()["data"]


def main():
    key_id = os.environ.get("APP_STORE_CONNECT_KEY_IDENTIFIER", "")
    issuer_id = os.environ.get("APP_STORE_CONNECT_ISSUER_ID", "")
    private_key = os.environ.get("APP_STORE_CONNECT_PRIVATE_KEY", "")
    bundle_id = os.environ.get("BUNDLE_ID", "")

    if not all([key_id, issuer_id, private_key, bundle_id]):
        print("ERROR: Missing required environment variables", file=sys.stderr)
        sys.exit(1)

    token = get_jwt_token(key_id, issuer_id, private_key)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    app_id = get_app_id(headers, bundle_id)
    versions = get_versions(headers, app_id)

    new_version = None
    if not versions:
        new_version = "1.0.0"
    else:
        latest = max(versions, key=lambda x: x["attributes"]["createdDate"])
        state = latest["attributes"]["appStoreState"]
        current_version = latest["attributes"]["versionString"]

        if state == "PENDING_DEVELOPER_RELEASE":
            print(
                "ERROR: App is Pending Developer Release. Publish it first.",
                file=sys.stderr,
            )
            sys.exit(1)
        elif state == "READY_FOR_SALE":
            new_version = increment_version(current_version)
        else:
            result = {
                "version": current_version,
                "version_id": latest["id"],
                "state": state,
            }

    if new_version:
        created = create_version(headers, app_id, new_version)
        result = {
            "version": new_version,
            "version_id": created["id"],
            "state": "PREPARE_FOR_SUBMISSION",
        }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
