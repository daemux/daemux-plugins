#!/usr/bin/env python3
"""
Submit an iOS app version for App Store review.

Polls App Store Connect API waiting for a build to finish processing,
attaches it to the version in PREPARE_FOR_SUBMISSION state, then submits
for review using the Review Submissions API.

Required env vars:
  APP_STORE_CONNECT_KEY_IDENTIFIER  - Key ID from App Store Connect
  APP_STORE_CONNECT_ISSUER_ID       - Issuer ID from App Store Connect
  APP_STORE_CONNECT_PRIVATE_KEY     - Contents of the P8 key file
  BUNDLE_ID                         - App bundle identifier
"""
import os
import sys
import time

try:
    import jwt
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "--break-system-packages",
        "PyJWT", "cryptography", "requests"
    ], stdout=subprocess.DEVNULL)
    import jwt
    import requests

BASE_URL = "https://api.appstoreconnect.apple.com/v1"
POLL_INTERVAL = 30
MAX_POLL_DURATION = 2400


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


def fail_on_error(resp, action):
    try:
        errors = resp.json().get("errors", [])
        for err in errors:
            detail = err.get("detail", err.get("title", "Unknown error"))
            print(f"ERROR ({action}): {detail}", file=sys.stderr)
    except (ValueError, KeyError):
        print(f"ERROR ({action}): HTTP {resp.status_code}", file=sys.stderr)
    sys.exit(1)


def poll_build_processing(headers, app_id, version_string, key_id, issuer_id, private_key):
    start = time.time()
    last_token_time = start

    while True:
        elapsed = int(time.time() - start)

        if time.time() - last_token_time > 900:
            token = get_jwt_token(key_id, issuer_id, private_key)
            headers["Authorization"] = f"Bearer {token}"
            last_token_time = time.time()

        resp = requests.get(
            f"{BASE_URL}/builds",
            params={
                "filter[app]": app_id,
                "filter[preReleaseVersion.version]": version_string,
                "sort": "-uploadedDate",
                "limit": 1,
            },
            headers=headers,
            timeout=(10, 30),
        )
        resp.raise_for_status()
        builds = resp.json().get("data", [])

        if builds:
            state = builds[0]["attributes"]["processingState"]
            if state == "VALID":
                print(f"  [{elapsed}s] Build processing complete.")
                return builds[0]
            if state in ("FAILED", "INVALID"):
                print(f"ERROR: Build processing ended with state '{state}'.", file=sys.stderr)
                sys.exit(1)
            print(f"  [{elapsed}s] Build processing... (state: {state})")
        else:
            print(f"  [{elapsed}s] Waiting for build to appear...")

        if elapsed >= MAX_POLL_DURATION:
            print(f"ERROR: Timed out after {MAX_POLL_DURATION}s waiting for build.", file=sys.stderr)
            sys.exit(1)

        time.sleep(POLL_INTERVAL)


def get_version_for_submission(headers, app_id):
    resp = requests.get(
        f"{BASE_URL}/apps/{app_id}/appStoreVersions",
        params={
            "filter[appStoreState]": "PREPARE_FOR_SUBMISSION",
            "filter[platform]": "IOS",
        },
        headers=headers,
        timeout=(10, 30),
    )
    resp.raise_for_status()
    versions = resp.json().get("data", [])
    if not versions:
        print("ERROR: No version in PREPARE_FOR_SUBMISSION state found.", file=sys.stderr)
        sys.exit(1)
    return versions[0]


def attach_build_to_version(headers, version_id, build_id):
    resp = requests.patch(
        f"{BASE_URL}/appStoreVersions/{version_id}/relationships/build",
        json={"data": {"type": "builds", "id": build_id}},
        headers=headers,
        timeout=(10, 30),
    )
    if not resp.ok:
        fail_on_error(resp, "attach build to version")
    print(f"  Build {build_id} attached to version {version_id}.")


def get_or_create_submission(headers, app_id):
    create_resp = requests.post(
        f"{BASE_URL}/reviewSubmissions",
        json={
            "data": {
                "type": "reviewSubmissions",
                "attributes": {"platform": "IOS"},
                "relationships": {
                    "app": {"data": {"type": "apps", "id": app_id}}
                },
            }
        },
        headers=headers,
        timeout=(10, 30),
    )

    if create_resp.status_code == 409:
        existing_resp = requests.get(
            f"{BASE_URL}/apps/{app_id}/reviewSubmissions",
            params={"filter[state]": "READY_FOR_REVIEW,WAITING_FOR_REVIEW"},
            headers=headers,
            timeout=(10, 30),
        )
        existing_resp.raise_for_status()
        submissions = existing_resp.json().get("data", [])
        if not submissions:
            print("ERROR: 409 Conflict but no existing submission found.", file=sys.stderr)
            sys.exit(1)
        return submissions[0]["id"]

    if not create_resp.ok:
        fail_on_error(create_resp, "create review submission")

    return create_resp.json()["data"]["id"]


def submit_for_review(headers, app_id, version_id):
    submission_id = get_or_create_submission(headers, app_id)
    print(f"  Review submission ID: {submission_id}")

    item_resp = requests.post(
        f"{BASE_URL}/reviewSubmissionItems",
        json={
            "data": {
                "type": "reviewSubmissionItems",
                "relationships": {
                    "reviewSubmission": {
                        "data": {"type": "reviewSubmissions", "id": submission_id}
                    },
                    "appStoreVersion": {
                        "data": {"type": "appStoreVersions", "id": version_id}
                    },
                },
            }
        },
        headers=headers,
        timeout=(10, 30),
    )
    if not item_resp.ok:
        fail_on_error(item_resp, "add review submission item")

    submit_resp = requests.patch(
        f"{BASE_URL}/reviewSubmissions/{submission_id}",
        json={
            "data": {
                "type": "reviewSubmissions",
                "id": submission_id,
                "attributes": {"submitted": True},
            }
        },
        headers=headers,
        timeout=(10, 30),
    )
    if not submit_resp.ok:
        fail_on_error(submit_resp, "submit for review")

    print("  Submitted for review successfully.")


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
    print(f"App ID: {app_id}")

    version = get_version_for_submission(headers, app_id)
    version_id = version["id"]
    version_string = version["attributes"]["versionString"]
    print(f"Version {version_string} (ID: {version_id})")

    print(f"Polling for processed build (version {version_string})...")
    build = poll_build_processing(headers, app_id, version_string, key_id, issuer_id, private_key)
    build_id = build["id"]
    build_version = build["attributes"]["version"]
    print(f"Build {build_version} (ID: {build_id})")

    print("Attaching build to version...")
    attach_build_to_version(headers, version_id, build_id)

    print("Submitting for App Store review...")
    submit_for_review(headers, app_id, version_id)

    print(f"Done. Version {version_string} (build {build_version}) submitted for review.")


if __name__ == "__main__":
    main()
