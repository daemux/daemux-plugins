#!/usr/bin/env python3
"""
Check Google Play readiness for automated publishing.

Reads a service account JSON file and verifies that the app exists on Google Play,
has at least one uploaded bundle, and has completed track setup.

Required env vars:
  SA_JSON       - Path to Google service account JSON file
  PACKAGE_NAME  - Android package name (e.g. com.example.app)

Output:
  Prints JSON with keys: ready (bool), missing_steps (list of strings)
  Exit code 0 on success (even if not ready), non-zero on fatal error.
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

API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
TIMEOUT = (10, 30)


def get_access_token(sa_path: str) -> str:
    """Obtain an OAuth2 access token using the service account credentials."""
    with open(sa_path, "r") as fh:
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
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": signed,
        },
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def check_readiness(package_name: str, access_token: str) -> dict:
    """Check whether the Google Play app is ready for automated publishing."""
    headers = {"Authorization": f"Bearer {access_token}"}
    missing_steps: list[str] = []

    # Create an edit session
    edit_resp = requests.post(
        f"{API_BASE}/{package_name}/edits",
        headers={**headers, "Content-Type": "application/json"},
        json={},
        timeout=TIMEOUT,
    )

    if edit_resp.status_code == 404:
        return {
            "ready": False,
            "missing_steps": ["1. CREATE APP: Go to Play Console > Create app"],
        }

    edit_resp.raise_for_status()
    edit_id = edit_resp.json()["id"]

    try:
        # Check for uploaded bundles
        bundles_resp = requests.get(
            f"{API_BASE}/{package_name}/edits/{edit_id}/bundles",
            headers=headers,
            timeout=TIMEOUT,
        )
        bundles_resp.raise_for_status()
        if not bundles_resp.json().get("bundles"):
            missing_steps.append("2. UPLOAD FIRST AAB via Play Console")

        # Check for track releases
        tracks_resp = requests.get(
            f"{API_BASE}/{package_name}/edits/{edit_id}/tracks",
            headers=headers,
            timeout=TIMEOUT,
        )
        tracks_resp.raise_for_status()
        has_release = any(
            release.get("versionCodes")
            for track in tracks_resp.json().get("tracks", [])
            for release in track.get("releases", [])
        )
        if not has_release:
            missing_steps.append("3. COMPLETE SETUP: Content rating + pricing")
    finally:
        # Always clean up the edit
        requests.delete(
            f"{API_BASE}/{package_name}/edits/{edit_id}",
            headers=headers,
            timeout=TIMEOUT,
        )

    return {"ready": not missing_steps, "missing_steps": missing_steps}


def main() -> None:
    sa_json = os.environ.get("SA_JSON", "")
    package_name = os.environ.get("PACKAGE_NAME", "")

    if not sa_json or not package_name:
        print("ERROR: SA_JSON and PACKAGE_NAME env vars are required", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(sa_json):
        print(f"ERROR: Service account file not found: {sa_json}", file=sys.stderr)
        sys.exit(1)

    access_token = get_access_token(sa_json)
    result = check_readiness(package_name, access_token)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
