"""App Store Connect Subscription Review Submission API layer.

Functions for submitting subscriptions and subscription groups for App Store review.
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


def create_review_submission(
    headers: dict, sub_id: str, reviewer_notes: str = "",
) -> dict | None:
    """Submit a subscription for App Store review.

    Idempotent: silently handles 409 Conflict (already submitted).
    """
    resp = requests.post(
        f"{BASE_URL}/subscriptionAppStoreReviewSubmissions",
        json={"data": {
            "type": "subscriptionAppStoreReviewSubmissions",
            "attributes": {"reviewerNotes": reviewer_notes} if reviewer_notes else {},
            "relationships": {
                "subscription": {"data": {"type": "subscriptions", "id": sub_id}},
            },
        }},
        headers=headers,
        timeout=TIMEOUT,
    )
    if resp.status_code == 409:
        return None
    if not resp.ok:
        print_api_errors(resp, f"submit subscription {sub_id} for review")
        return None
    print(f"      Submitted subscription {sub_id} for review")
    return resp.json().get("data")


def create_group_submission(
    headers: dict, group_id: str,
) -> dict | None:
    """Submit a subscription group for App Store review.

    Idempotent: silently handles 409 Conflict (already submitted).
    """
    resp = requests.post(
        f"{BASE_URL}/subscriptionGroupSubmissions",
        json={"data": {
            "type": "subscriptionGroupSubmissions",
            "relationships": {
                "subscriptionGroup": {
                    "data": {"type": "subscriptionGroups", "id": group_id},
                },
            },
        }},
        headers=headers,
        timeout=TIMEOUT,
    )
    if resp.status_code == 409:
        return None
    if not resp.ok:
        print_api_errors(resp, f"submit group {group_id} for review")
        return None
    print(f"    Submitted subscription group {group_id} for review")
    return resp.json().get("data")
