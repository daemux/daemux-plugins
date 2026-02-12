#!/usr/bin/env python3
"""
Sync iOS In-App Purchases to App Store Connect via the REST API.

Reads iap_config.json and creates/updates subscription groups and subscriptions.
Idempotent: safe to run repeatedly -- existing resources are skipped or updated.

Required env vars:
  APP_STORE_CONNECT_KEY_IDENTIFIER  - Key ID from App Store Connect
  APP_STORE_CONNECT_ISSUER_ID       - Issuer ID from App Store Connect
  APP_STORE_CONNECT_PRIVATE_KEY     - Contents of the P8 key file
  BUNDLE_ID                         - App bundle identifier

Usage:
  python3 sync_iap_ios.py <path/to/iap_config.json>
"""
import json
import os
import sys

from asc_iap_api import (
    create_localization,
    create_subscription,
    create_subscription_group,
    get_app_id,
    get_jwt_token,
    get_subscription_localizations,
    list_subscription_groups,
    list_subscriptions_in_group,
    update_localization,
)


def find_or_create_group(headers: dict, app_id: str, reference_name: str, existing_groups: list) -> str:
    """Find an existing subscription group by reference name or create a new one."""
    for group in existing_groups:
        if group["attributes"]["referenceName"] == reference_name:
            group_id = group["id"]
            print(f"  Subscription group '{reference_name}' already exists (ID: {group_id})")
            return group_id
    return create_subscription_group(headers, app_id, reference_name)


def find_or_create_subscription(headers: dict, group_id: str, sub_config: dict, existing_subs: list) -> str:
    """Find an existing subscription by product ID or create a new one."""
    product_id = sub_config["product_id"]
    for sub in existing_subs:
        if sub["attributes"]["productId"] == product_id:
            sub_id = sub["id"]
            print(f"    Subscription '{product_id}' already exists (ID: {sub_id})")
            return sub_id
    return create_subscription(headers, group_id, sub_config)


def set_subscription_localization(headers: dict, sub_id: str, locale: str, loc_data: dict) -> None:
    """Create or update a localization for a subscription."""
    existing = get_subscription_localizations(headers, sub_id)
    for loc in existing:
        if loc["attributes"]["locale"] == locale:
            update_localization(headers, loc["id"], loc_data)
            return
    create_localization(headers, sub_id, locale, loc_data)


def sync_subscription_group(headers: dict, app_id: str, group_config: dict, existing_groups: list) -> dict:
    """Sync a single subscription group and its subscriptions. Returns sync result."""
    ref_name = group_config.get("reference_name", group_config.get("group_name", ""))
    if not ref_name:
        print("WARNING: Subscription group missing reference_name, skipping", file=sys.stderr)
        return {"group": ref_name, "status": "skipped", "subscriptions": []}

    print(f"\nProcessing subscription group: {ref_name}")
    group_id = find_or_create_group(headers, app_id, ref_name, existing_groups)

    existing_subs = list_subscriptions_in_group(headers, group_id)
    sub_results = []

    for sub_config in group_config.get("subscriptions", []):
        sub_id = find_or_create_subscription(headers, group_id, sub_config, existing_subs)
        _sync_subscription_localizations(headers, sub_id, sub_config)
        sub_results.append({"product_id": sub_config["product_id"], "id": sub_id})

    return {"group": ref_name, "group_id": group_id, "subscriptions": sub_results}


def _sync_subscription_localizations(headers: dict, sub_id: str, sub_config: dict) -> None:
    """Sync localizations for a subscription from its config."""
    localizations = sub_config.get("localizations", {})
    if not localizations:
        return
    for locale, loc_data in localizations.items():
        set_subscription_localization(headers, sub_id, locale, loc_data)


def validate_env() -> tuple:
    """Validate required environment variables. Returns (key_id, issuer_id, private_key, bundle_id)."""
    key_id = os.environ.get("APP_STORE_CONNECT_KEY_IDENTIFIER", "")
    issuer_id = os.environ.get("APP_STORE_CONNECT_ISSUER_ID", "")
    private_key = os.environ.get("APP_STORE_CONNECT_PRIVATE_KEY", "")
    bundle_id = os.environ.get("BUNDLE_ID", "")

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

    return key_id, issuer_id, private_key, bundle_id


def load_iap_config(config_path: str) -> dict:
    """Load and validate the IAP config file."""
    if not os.path.isfile(config_path):
        print(f"ERROR: IAP config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    if not config.get("subscription_groups"):
        print("WARNING: No subscription_groups found in config", file=sys.stderr)

    return config


def main() -> None:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path/to/iap_config.json>", file=sys.stderr)
        sys.exit(1)

    config_path = sys.argv[1]
    key_id, issuer_id, private_key, bundle_id = validate_env()

    token = get_jwt_token(key_id, issuer_id, private_key)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    config = load_iap_config(config_path)
    app_id = get_app_id(headers, bundle_id)
    print(f"App ID: {app_id} (Bundle: {bundle_id})")

    existing_groups = list_subscription_groups(headers, app_id)
    results = []

    for group_config in config.get("subscription_groups", []):
        result = sync_subscription_group(headers, app_id, group_config, existing_groups)
        results.append(result)

    print(f"\n{json.dumps({'synced_groups': results}, indent=2)}")


if __name__ == "__main__":
    main()
