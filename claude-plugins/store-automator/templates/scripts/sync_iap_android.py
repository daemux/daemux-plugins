#!/usr/bin/env python3
"""
Sync Android In-App Purchases to Google Play via the Android Publisher API.

Reads iap_config.json and creates/updates subscriptions with base plans and offers.
Idempotent: safe to run repeatedly -- existing resources are skipped or updated.

Required env vars:
  SA_JSON       - Path to Google service account JSON file
  PACKAGE_NAME  - Android package name (e.g. com.example.app)

Usage:
  python3 sync_iap_android.py <path/to/iap_config.json>
"""
import json
import os
import sys

from gplay_iap_api import (
    activate_base_plan,
    build_price,
    create_intro_offer,
    create_subscription,
    currency_to_region,
    get_access_token,
    list_subscriptions,
    normalize_duration,
    update_subscription,
)


def _build_base_plan(sub_config: dict) -> dict:
    """Build a base plan object from subscription config."""
    duration = normalize_duration(sub_config["duration"])
    prices = sub_config.get("prices", {})
    usd_price = prices.get("USD", sub_config.get("price_tier", "0"))
    eur_price = prices.get("EUR", usd_price)

    regional_configs = []
    for currency, amount in prices.items():
        region = currency_to_region(currency)
        if region:
            regional_configs.append({
                "regionCode": region,
                "newSubscriberAvailability": True,
                "price": build_price(amount, currency),
            })

    return {
        "basePlanId": sub_config["product_id"].replace(".", "-").replace("_", "-"),
        "autoRenewingBasePlanType": {
            "billingPeriodDuration": duration,
            "gracePeriodDuration": "P3D",
            "resubscribeState": "RESUBSCRIBE_STATE_ACTIVE",
            "legacyCompatible": True,
        },
        "regionalConfigs": regional_configs,
        "otherRegionsConfig": {
            "usdPrice": build_price(usd_price, "USD"),
            "eurPrice": build_price(eur_price, "EUR"),
            "newSubscriberAvailability": True,
        },
    }


def _build_listings(sub_config: dict) -> list:
    """Build localized listings from subscription config."""
    localizations = sub_config.get("localizations", {})
    listings = []

    if localizations:
        for lang_code, loc_data in localizations.items():
            listings.append({
                "languageCode": lang_code,
                "title": loc_data.get("name", sub_config["reference_name"]),
                "description": loc_data.get("description", ""),
                "benefits": loc_data.get("benefits", []),
            })
    else:
        listings.append({
            "languageCode": "en-US",
            "title": sub_config["reference_name"],
            "description": sub_config.get("description", ""),
            "benefits": [],
        })

    return listings


def _build_subscription_body(sub_config: dict, package_name: str) -> dict:
    """Build the full subscription request body."""
    return {
        "packageName": package_name,
        "productId": sub_config["product_id"],
        "basePlans": [_build_base_plan(sub_config)],
        "listings": _build_listings(sub_config),
    }


def _build_intro_offer_body(sub_config: dict) -> dict:
    """Build the introductory offer request body from subscription config."""
    intro = sub_config["introductory_offer"]
    offer_type = intro.get("type", "FREE")
    duration = normalize_duration(intro.get("duration", "P1W"))

    phases = [{"recurrenceCount": intro.get("periods", 1), "duration": duration}]

    if offer_type in ("FREE", "FREE_TRIAL"):
        phases[0]["regionalConfigs"] = [
            {"regionCode": "US", "price": build_price("0", "USD")}
        ]
    else:
        price = intro.get("price", "0")
        phases[0]["regionalConfigs"] = [
            {"regionCode": "US", "price": build_price(price, "USD")}
        ]

    offer_id = f"{sub_config['product_id'].replace('.', '-').replace('_', '-')}-intro"
    return {
        "offerId": offer_id,
        "phases": phases,
        "targeting": {
            "acquisitionRule": {
                "scope": {"thisSubscription": {}}
            }
        },
        "regionalConfigs": [{"regionCode": "US", "newSubscriberAvailability": True}],
    }


def sync_subscription(headers: dict, package_name: str, sub_config: dict, existing: dict) -> dict:
    """Sync a single subscription: create if missing, update if exists."""
    product_id = sub_config["product_id"]
    print(f"\n  Processing subscription: {product_id}")
    body = _build_subscription_body(sub_config, package_name)

    if product_id in existing:
        update_subscription(headers, package_name, product_id, body)
        return {"product_id": product_id, "action": "updated"}

    result = create_subscription(headers, package_name, product_id, body)
    if not result:
        return {"product_id": product_id, "action": "failed"}

    base_plan_id = product_id.replace(".", "-").replace("_", "-")
    activate_base_plan(headers, package_name, product_id, base_plan_id)

    if sub_config.get("introductory_offer"):
        offer_body = _build_intro_offer_body(sub_config)
        offer_id = f"{product_id.replace('.', '-').replace('_', '-')}-intro"
        create_intro_offer(headers, package_name, product_id, base_plan_id, offer_id, offer_body)

    return {"product_id": product_id, "action": "created"}


def validate_env() -> tuple:
    """Validate required environment variables. Returns (sa_path, package_name)."""
    sa_json = os.environ.get("SA_JSON", "")
    package_name = os.environ.get("PACKAGE_NAME", "")

    if not sa_json or not package_name:
        print("ERROR: SA_JSON and PACKAGE_NAME env vars are required", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(sa_json):
        print(f"ERROR: Service account file not found: {sa_json}", file=sys.stderr)
        sys.exit(1)

    return sa_json, package_name


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
    sa_json, package_name = validate_env()

    access_token = get_access_token(sa_json)
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    config = load_iap_config(config_path)
    print(f"Package: {package_name}")

    existing = list_subscriptions(headers, package_name)
    print(f"Found {len(existing)} existing subscription(s)")

    results = []
    for group in config.get("subscription_groups", []):
        group_name = group.get("reference_name", group.get("group_name", "Unknown"))
        print(f"\nProcessing group: {group_name}")
        for sub_config in group.get("subscriptions", []):
            result = sync_subscription(headers, package_name, sub_config, existing)
            results.append(result)

    print(f"\n{json.dumps({'synced_subscriptions': results}, indent=2)}")


if __name__ == "__main__":
    main()
