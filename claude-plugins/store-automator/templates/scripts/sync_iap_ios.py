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
  PROJECT_ROOT                      - Absolute path to the project root

Usage:
  python3 sync_iap_ios.py <path/to/iap_config.json>
"""
import hashlib
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
from asc_subscription_setup import (
    commit_review_screenshot,
    create_subscription_availability,
    create_subscription_price,
    find_price_point_by_amount,
    get_price_points_for_territory,
    get_review_screenshot,
    get_subscription_availability,
    get_subscription_prices,
    reserve_review_screenshot,
    upload_screenshot_chunks,
)

CURRENCY_TO_TERRITORY = {
    "USD": "USA", "EUR": "FRA", "GBP": "GBR", "JPY": "JPN",
    "AUD": "AUS", "CAD": "CAN", "CHF": "CHE", "CNY": "CHN",
    "KRW": "KOR", "SEK": "SWE", "NOK": "NOR", "DKK": "DNK",
    "INR": "IND", "BRL": "BRA", "MXN": "MEX", "RUB": "RUS",
    "TRY": "TUR", "SAR": "SAU", "AED": "ARE", "HKD": "HKG",
    "SGD": "SGP", "NZD": "NZL", "TWD": "TWN", "THB": "THA",
    "MYR": "MYS", "PHP": "PHL", "IDR": "IDN", "ILS": "ISR",
    "ZAR": "ZAF", "PLN": "POL", "CZK": "CZE", "HUF": "HUN",
    "RON": "ROU", "BGN": "BGR", "HRK": "HRV", "COP": "COL",
    "CLP": "CHL", "PEN": "PER", "EGP": "EGY", "NGN": "NGA",
    "PKR": "PAK", "KZT": "KAZ", "QAR": "QAT", "KWD": "KWT",
}


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


def sync_subscription_group(
    headers: dict, app_id: str, group_config: dict,
    existing_groups: list, project_root: str,
) -> dict:
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
        for locale, loc_data in sub_config.get("localizations", {}).items():
            set_subscription_localization(headers, sub_id, locale, loc_data)
        _sync_availability(headers, sub_id, sub_config)
        _sync_pricing(headers, sub_id, sub_config)
        _sync_review_screenshot(headers, sub_id, sub_config, project_root)
        sub_results.append({"product_id": sub_config["product_id"], "id": sub_id})

    return {"group": ref_name, "group_id": group_id, "subscriptions": sub_results}


def _sync_availability(headers: dict, sub_id: str, sub_config: dict) -> None:
    """Ensure subscription territory availability is configured."""
    avail_config = sub_config.get("availability", {})
    available_in_new = avail_config.get("available_in_new_territories", True)
    territory_ids = avail_config.get("territories", [])

    existing = get_subscription_availability(headers, sub_id)
    if existing:
        print("      Subscription availability already configured")
        return

    result = create_subscription_availability(
        headers, sub_id, territory_ids, available_in_new=available_in_new,
    )
    if result:
        print("      Subscription availability configured successfully")
    else:
        print("      WARNING: Failed to configure availability", file=sys.stderr)


def _sync_pricing(headers: dict, sub_id: str, sub_config: dict) -> None:
    """Set subscription prices per territory from config."""
    prices = sub_config.get("prices", {})
    if not prices:
        print("      WARNING: No prices configured, skipping pricing", file=sys.stderr)
        return

    existing_prices = get_subscription_prices(headers, sub_id)
    if existing_prices:
        print("      Pricing already configured")
        return

    for currency, amount in prices.items():
        territory = CURRENCY_TO_TERRITORY.get(currency)
        if not territory:
            print(f"      WARNING: Unknown currency '{currency}', skipping", file=sys.stderr)
            continue
        price_points = get_price_points_for_territory(headers, sub_id, territory)
        point = find_price_point_by_amount(price_points, amount)
        if not point:
            print(f"      WARNING: No price point matching {amount} for {territory}", file=sys.stderr)
            continue
        result = create_subscription_price(headers, sub_id, point["id"])
        if result:
            print(f"      Set price {amount} for territory {territory}")
        else:
            print(f"      WARNING: Failed to set price for {territory}", file=sys.stderr)


def _sync_review_screenshot(
    headers: dict, sub_id: str, sub_config: dict, project_root: str,
) -> None:
    """Upload a review screenshot for the subscription if configured."""
    screenshot_path = sub_config.get("review_screenshot")
    if not screenshot_path:
        print("      WARNING: No review_screenshot configured, skipping", file=sys.stderr)
        return

    full_path = os.path.join(project_root, screenshot_path)
    if not os.path.isfile(full_path):
        print(f"      WARNING: Screenshot not found: {full_path}", file=sys.stderr)
        return

    existing = get_review_screenshot(headers, sub_id)
    if existing:
        print("      Review screenshot already uploaded")
        return

    with open(full_path, "rb") as f:
        file_data = f.read()

    file_name = os.path.basename(full_path)
    md5_checksum = hashlib.md5(file_data).hexdigest()

    reservation = reserve_review_screenshot(headers, sub_id, file_name, len(file_data))
    if not reservation:
        print("      WARNING: Failed to reserve screenshot upload", file=sys.stderr)
        return

    screenshot_id = reservation["id"]
    upload_ops = reservation["attributes"].get("uploadOperations", [])

    success = upload_screenshot_chunks(upload_ops, file_data)
    if not success:
        print("      WARNING: Screenshot chunk upload failed, skipping commit", file=sys.stderr)
        return
    result = commit_review_screenshot(headers, screenshot_id, md5_checksum)
    if result:
        print(f"      Review screenshot uploaded: {file_name}")
    else:
        print("      WARNING: Failed to commit screenshot upload", file=sys.stderr)


def validate_env() -> tuple:
    """Validate required environment variables. Returns (key_id, issuer_id, private_key, bundle_id, project_root)."""
    required_vars = [
        "APP_STORE_CONNECT_KEY_IDENTIFIER",
        "APP_STORE_CONNECT_ISSUER_ID",
        "APP_STORE_CONNECT_PRIVATE_KEY",
        "BUNDLE_ID",
        "PROJECT_ROOT",
    ]
    values = {var: os.environ.get(var, "") for var in required_vars}
    missing = [var for var, val in values.items() if not val]
    if missing:
        print(f"ERROR: Missing required environment variables: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)
    return tuple(values.values())


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
    key_id, issuer_id, private_key, bundle_id, project_root = validate_env()

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
        result = sync_subscription_group(
            headers, app_id, group_config, existing_groups, project_root,
        )
        results.append(result)

    print(f"\n{json.dumps({'synced_groups': results}, indent=2)}")


if __name__ == "__main__":
    main()
