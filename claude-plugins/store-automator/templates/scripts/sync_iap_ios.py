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
import time

import requests

from asc_iap_api import (
    BASE_URL,
    TIMEOUT,
    create_group_localization,
    create_localization,
    create_subscription,
    create_subscription_group,
    get_app_id,
    get_group_localizations,
    get_jwt_token,
    get_subscription_localizations,
    list_subscription_groups,
    list_subscriptions_in_group,
    print_api_errors,
    update_group_localization,
    update_localization,
)
from asc_subscription_setup import (
    create_subscription_availability,
    create_subscription_price,
    find_price_point_by_amount,
    get_price_point_equalizations,
    get_price_points_for_territory,
    get_review_screenshot,
    get_subscription_availability,
    get_subscription_prices,
    list_all_territory_ids,
    upload_review_screenshot,
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

    # Sync group localizations
    group_localizations = group_config.get("localizations", {})
    if group_localizations:
        existing_locs = get_group_localizations(headers, group_id)
        existing_map = {loc["attributes"]["locale"]: loc for loc in existing_locs}

        for locale, loc_data in group_localizations.items():
            name = loc_data.get("name", "")
            custom_name = loc_data.get("custom_name")

            if locale in existing_map:
                update_group_localization(
                    headers, existing_map[locale]["id"], name, custom_name
                )
                print(f"    Updated group localization: {locale}")
            else:
                create_group_localization(
                    headers, group_id, locale, name, custom_name
                )
                print(f"    Created group localization: {locale}")

    existing_subs = list_subscriptions_in_group(headers, group_id)
    sub_results = []

    for sub_config in group_config.get("subscriptions", []):
        sub_id = find_or_create_subscription(headers, group_id, sub_config, existing_subs)
        for locale, loc_data in sub_config.get("localizations", {}).items():
            set_subscription_localization(headers, sub_id, locale, loc_data)
        _sync_availability(headers, sub_id, sub_config)
        _sync_pricing(headers, sub_id, sub_config)
        _sync_review_screenshot(headers, sub_id, sub_config, project_root)
        # Patch subscription to trigger Apple's state re-evaluation
        resp = requests.patch(
            f"{BASE_URL}/subscriptions/{sub_id}",
            json={"data": {
                "type": "subscriptions", "id": sub_id,
                "attributes": {"reviewNote": "", "familySharable": False},
            }},
            headers=headers,
            timeout=TIMEOUT,
        )
        if not resp.ok:
            print_api_errors(resp, f"touch subscription {sub_id}")
        sub_results.append({"product_id": sub_config["product_id"], "id": sub_id})

    return {"group": ref_name, "group_id": group_id, "subscriptions": sub_results}


def _sync_availability(headers: dict, sub_id: str, sub_config: dict) -> None:
    """Ensure subscription territory availability is configured with all territories.

    If availability already exists, it is left as-is (idempotent skip).
    Otherwise fetches all App Store territories and creates availability.
    """
    existing = get_subscription_availability(headers, sub_id)
    if existing:
        print("      Availability already configured")
        return

    avail_config = sub_config.get("availability", {})
    available_in_new = avail_config.get("available_in_new_territories", True)
    territory_ids = avail_config.get("territories", [])

    # If no territories specified, fetch all to make available everywhere
    if not territory_ids:
        territory_ids = list_all_territory_ids(headers)
        if not territory_ids:
            print("      WARNING: Could not fetch territories", file=sys.stderr)
            return

    result = create_subscription_availability(
        headers, sub_id, territory_ids, available_in_new=available_in_new,
    )
    if result:
        print(f"      Availability set ({len(territory_ids)} territories)")
    else:
        print("      WARNING: Failed to configure availability", file=sys.stderr)


def _sync_pricing(headers: dict, sub_id: str, sub_config: dict) -> None:
    """Set subscription prices for all territories using Apple's equalization.

    Finds the base price point (USD/USA), then uses the equalizations
    endpoint to get Apple-calculated prices for all other territories.
    """
    prices = sub_config.get("prices", {})
    if not prices:
        print("      WARNING: No prices configured, skipping pricing", file=sys.stderr)
        return

    # Build set of territories that already have prices
    existing_prices = get_subscription_prices(headers, sub_id)
    priced_territories: set[str] = set()
    for ep in existing_prices:
        pp_rel = ep.get("relationships", {}).get("subscriptionPricePoint", {})
        pp_id = pp_rel.get("data", {}).get("id", "")
        if "_" in pp_id:
            priced_territories.add(pp_id.rsplit("_", 1)[-1])

    # Use first configured currency as base (typically USD -> USA)
    base_currency = next(iter(prices))
    base_amount = prices[base_currency]
    base_territory = CURRENCY_TO_TERRITORY.get(base_currency)
    if not base_territory:
        print(f"      WARNING: Unknown base currency '{base_currency}'", file=sys.stderr)
        return

    # Find the base price point
    price_points = get_price_points_for_territory(headers, sub_id, base_territory)
    base_point = find_price_point_by_amount(price_points, base_amount)
    if not base_point:
        sample = [pp.get("attributes", {}).get("customerPrice", "?") for pp in price_points[:5]]
        print(
            f"      WARNING: No price point matching {base_amount} for {base_territory}"
            f" (API returned {len(price_points)} points, first prices: {sample})",
            file=sys.stderr,
        )
        return

    created, skipped, failed = _apply_equalized_prices(
        headers, sub_id, base_point, base_territory, base_amount, base_currency, priced_territories,
    )
    print(f"      Pricing: {created} set, {skipped} existed, {failed} failed")


def _apply_equalized_prices(
    headers: dict, sub_id: str, base_point: dict,
    base_territory: str, base_amount: str, base_currency: str,
    priced_territories: set[str],
) -> tuple[int, int, int]:
    """Set base price then apply Apple-equalized prices for all territories."""
    created = 0
    skipped = 0
    failed = 0

    # Always set base territory price to ensure it matches config.
    # Apple's preserveCurrentPrice=False handles updates; if the price
    # is already correct this is effectively a no-op re-confirmation.
    result = create_subscription_price(headers, sub_id, base_point["id"], base_territory)
    if result:
        created += 1
        print(f"      Set base price {base_amount} {base_currency} for {base_territory}")
    else:
        failed += 1
        print(f"      WARNING: Failed to set base price for {base_territory}", file=sys.stderr)
        return created, skipped, failed

    # Get equalized prices for all other territories
    equalized = get_price_point_equalizations(headers, base_point["id"])
    if not equalized:
        print("      WARNING: No equalizations returned", file=sys.stderr)
        return created, skipped, failed

    # Set price for each equalized territory
    for eq_point in equalized:
        territory_id = eq_point.get("relationships", {}).get(
            "territory", {}
        ).get("data", {}).get("id")
        if not territory_id:
            failed += 1
            continue
        if territory_id in priced_territories:
            skipped += 1
            continue
        result = create_subscription_price(headers, sub_id, eq_point["id"], territory_id)
        if result:
            created += 1
        else:
            failed += 1
        time.sleep(0.05)

    return created, skipped, failed


def _sync_review_screenshot(
    headers: dict, sub_id: str, sub_config: dict, project_root: str,
) -> None:
    """Upload a review screenshot for the subscription if configured.

    Falls back to the first iPhone screenshot from fastlane/screenshots/ios/en-US/
    when the configured path does not exist.
    """
    screenshot_path = sub_config.get("review_screenshot")
    if not screenshot_path:
        print("      WARNING: No review_screenshot configured, skipping", file=sys.stderr)
        return

    full_path = os.path.join(project_root, screenshot_path)
    if not os.path.isfile(full_path):
        full_path = _find_fallback_screenshot(project_root)
        if not full_path:
            print(f"      WARNING: Screenshot not found: {screenshot_path}", file=sys.stderr)
            return
        print(f"      Using fallback screenshot: {os.path.basename(full_path)}")

    existing = get_review_screenshot(headers, sub_id)
    if existing:
        print("      Review screenshot already uploaded")
        return

    with open(full_path, "rb") as f:
        file_data = f.read()

    file_name = os.path.basename(full_path)
    md5_checksum = hashlib.md5(file_data).hexdigest()
    result = upload_review_screenshot(headers, sub_id, file_name, file_data, md5_checksum)
    if result:
        print(f"      Review screenshot uploaded: {file_name}")
    else:
        print("      WARNING: Failed to upload screenshot", file=sys.stderr)


def _find_fallback_screenshot(project_root: str) -> str | None:
    """Find the first iPhone PNG screenshot in fastlane/screenshots/ios/en-US/."""
    ios_dir = os.path.join(project_root, "fastlane", "screenshots", "ios", "en-US")
    if not os.path.isdir(ios_dir):
        return None
    files = sorted(os.listdir(ios_dir))
    for f in files:
        if f.lower().endswith(".png") and "iphone" in f.lower():
            return os.path.join(ios_dir, f)
    for f in files:
        if f.lower().endswith(".png"):
            return os.path.join(ios_dir, f)
    return None


def main() -> None:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path/to/iap_config.json>", file=sys.stderr)
        sys.exit(1)

    # Validate required environment variables
    required_vars = [
        "APP_STORE_CONNECT_KEY_IDENTIFIER", "APP_STORE_CONNECT_ISSUER_ID",
        "APP_STORE_CONNECT_PRIVATE_KEY", "BUNDLE_ID", "PROJECT_ROOT",
    ]
    env = {var: os.environ.get(var, "") for var in required_vars}
    missing = [var for var, val in env.items() if not val]
    if missing:
        print(f"ERROR: Missing env vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)
    key_id, issuer_id, private_key, bundle_id, project_root = env.values()

    # Load IAP config
    config_path = sys.argv[1]
    if not os.path.isfile(config_path):
        print(f"ERROR: IAP config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)
    if not config.get("subscription_groups"):
        print("WARNING: No subscription_groups found in config", file=sys.stderr)

    token = get_jwt_token(key_id, issuer_id, private_key)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

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
