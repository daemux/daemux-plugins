#!/usr/bin/env python3
"""
Update Google Play data safety section from a CSV file.

Uses the Google Play Android Developer API v3 via the
google-api-python-client library with service account authentication.

IMPORTANT: The Google Play Developer API has LIMITED support for
programmatic data safety form updates. The API supports editing the
data safety form only through the App Content API (appEdits).
If the API does not support the operation, this script logs the
limitation and exits gracefully.

CSV format:
  question_id,response
  DATA_COLLECTED_PERSONAL_INFO,true
  DATA_SHARED_PERSONAL_INFO,false
  ...

Environment variables:
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH - path to service account JSON
  PACKAGE_NAME - Android package name (e.g., com.firstclass.gigachat)
"""

import csv
import json
import os
import sys
from pathlib import Path


def ensure_dependencies():
    """Install required Python packages if not already present."""
    import subprocess
    subprocess.run(
        ["pip3", "install", "--break-system-packages", "google-api-python-client", "google-auth"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def load_service_account_credentials(sa_json_path: str):
    """Load Google service account credentials."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        credentials = service_account.Credentials.from_service_account_file(
            sa_json_path,
            scopes=["https://www.googleapis.com/auth/androidpublisher"],
        )
        service = build("androidpublisher", "v3", credentials=credentials)
        return service
    except ImportError:
        print(
            "ERROR: google-api-python-client or google-auth not installed.",
            file=sys.stderr,
        )
        print("Install with: pip3 install google-api-python-client google-auth", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Failed to load service account: {e}", file=sys.stderr)
        sys.exit(1)


def parse_data_safety_csv(csv_path: str) -> dict:
    """Parse the data safety CSV file into a dictionary."""
    data = {}
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            question_id = row.get("question_id", "").strip()
            response = row.get("response", "").strip()
            if question_id:
                data[question_id] = response
    return data


def _cleanup_edit_with_warning(service, package_name: str, edit_id: str, warning: str):
    """Print a warning and delete an unused edit."""
    print(f"WARNING: {warning}", file=sys.stderr)
    print("Data safety forms must be updated manually via Google Play Console.", file=sys.stderr)
    service.edits().delete(packageName=package_name, editId=edit_id).execute()


def _apply_data_safety_edit(service, package_name: str, edit_id: str, data_safety_responses: dict) -> bool:
    """Apply data safety responses within an existing edit. Returns True on success."""
    try:
        current = (
            service.edits()
            .dataSafety()
            .get(packageName=package_name, editId=edit_id)
            .execute()
        )
        print(f"Current data safety state retrieved: {json.dumps(current, indent=2)}")
        update_body = current.copy()
        for question_id, response in data_safety_responses.items():
            update_body[question_id] = response

        service.edits().dataSafety().update(
            packageName=package_name,
            editId=edit_id,
            body=update_body,
        ).execute()
        print("Data safety form updated")

        service.edits().commit(
            packageName=package_name, editId=edit_id
        ).execute()
        print(f"Edit {edit_id} committed successfully")
        return True

    except AttributeError:
        _cleanup_edit_with_warning(
            service, package_name, edit_id,
            "The dataSafety API endpoint is not available in the current google-api-python-client version.",
        )
        return False

    except Exception as e:
        error_str = str(e)
        if "404" in error_str or "not found" in error_str.lower():
            _cleanup_edit_with_warning(
                service, package_name, edit_id,
                "The dataSafety endpoint returned 404. This API may not be available for this app yet.",
            )
            return False
        raise


def update_data_safety(
    service, package_name: str, data_safety_responses: dict
) -> bool:
    """
    Attempt to update the data safety form via the Google Play API.

    Creates an edit, delegates the data safety update to _apply_data_safety_edit,
    and handles top-level failures.

    Returns True on success, False if the API does not support the operation.
    """
    try:
        edit_request = service.edits().insert(packageName=package_name, body={})
        edit_response = edit_request.execute()
        edit_id = edit_response["id"]
        print(f"Created edit: {edit_id}")

        return _apply_data_safety_edit(service, package_name, edit_id, data_safety_responses)

    except Exception as e:
        print(f"ERROR: Failed to update data safety: {e}", file=sys.stderr)
        return False


def validate_inputs():
    """Validate environment variables and CLI arguments. Returns (sa_json_path, package_name, csv_path)."""
    sa_json_path = os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH", "")
    package_name = os.environ.get("PACKAGE_NAME", "")

    if not sa_json_path:
        print("ERROR: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH not set", file=sys.stderr)
        sys.exit(1)

    if not package_name:
        print("ERROR: PACKAGE_NAME not set", file=sys.stderr)
        sys.exit(1)

    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <data_safety.csv>", file=sys.stderr)
        sys.exit(1)

    csv_path = sys.argv[1]
    if not Path(csv_path).exists():
        print(f"ERROR: CSV file not found: {csv_path}", file=sys.stderr)
        sys.exit(1)

    if not Path(sa_json_path).exists():
        print(f"ERROR: Service account JSON not found: {sa_json_path}", file=sys.stderr)
        sys.exit(1)

    return sa_json_path, package_name, csv_path


def main():
    # --- Ensure dependencies are installed ---
    ensure_dependencies()

    # --- Validate inputs ---
    sa_json_path, package_name, csv_path = validate_inputs()

    # --- Parse CSV ---
    data_safety_responses = parse_data_safety_csv(csv_path)
    print(f"Parsed {len(data_safety_responses)} data safety responses from {csv_path}")

    if not data_safety_responses:
        print("WARNING: No data safety responses found in CSV. Nothing to update.")
        sys.exit(0)

    # --- Connect to Google Play API ---
    service = load_service_account_credentials(sa_json_path)

    # --- Attempt update ---
    success = update_data_safety(service, package_name, data_safety_responses)

    if success:
        print("Data safety update completed successfully")
        result = {"status": "updated", "responses_count": len(data_safety_responses)}
    else:
        print("Data safety update was not applied (API limitation)")
        print("Please update the data safety form manually at:")
        print(f"  https://play.google.com/console/developers/app/{package_name}/app-content/data-safety")
        result = {"status": "manual_required", "responses_count": len(data_safety_responses)}

    print(json.dumps(result))
    # Exit 0 even on API limitation -- this is graceful degradation
    sys.exit(0)


if __name__ == "__main__":
    main()
