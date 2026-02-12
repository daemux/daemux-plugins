#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
source "$COMMON_DIR/read-config.sh"

echo "=== iOS Signing Setup (Fastlane Match) ==="

# --- Step 1: Validate config (read-config.sh already exported vars) ---
validate_config() {
  local match_key="$PROJECT_ROOT/$MATCH_DEPLOY_KEY_PATH"
  if [ ! -f "$match_key" ]; then
    echo "ERROR: Match deploy key not found at $match_key" >&2
    exit 1
  fi

  if [ -z "$MATCH_GIT_URL" ]; then
    echo "ERROR: MATCH_GIT_URL not configured in ci.config.yaml" >&2
    exit 1
  fi

  if [ -z "${MATCH_PASSWORD:-}" ]; then
    echo "ERROR: MATCH_PASSWORD env var is required (encryption password for Match repo)" >&2
    exit 1
  fi

  local p8_key="$PROJECT_ROOT/$P8_KEY_PATH"
  if [ ! -f "$p8_key" ]; then
    echo "ERROR: P8 key file not found at $p8_key" >&2
    exit 1
  fi
}

# --- Step 2: Set up SSH agent with deploy key ---
setup_ssh_agent() {
  echo "Setting up SSH agent..."
  local match_key="$PROJECT_ROOT/$MATCH_DEPLOY_KEY_PATH"

  eval "$(ssh-agent -s)"
  chmod 600 "$match_key"
  ssh-add "$match_key"

  mkdir -p ~/.ssh
  ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null

  echo "SSH agent configured with deploy key"
}

# --- Step 3: Set up App Store Connect API key ---
API_KEY_JSON="/tmp/fastlane_api_key.json"

setup_api_key() {
  local p8_full_path="$PROJECT_ROOT/$P8_KEY_PATH"

  # Env vars for Match and Fastlane built-in api_key resolution
  export APP_STORE_CONNECT_API_KEY_KEY_ID="$APPLE_KEY_ID"
  export APP_STORE_CONNECT_API_KEY_ISSUER_ID="$APPLE_ISSUER_ID"
  export APP_STORE_CONNECT_API_KEY_KEY="$(cat "$p8_full_path")"
  export APP_STORE_CONNECT_API_KEY_IS_KEY_CONTENT_BASE64="false"

  # Aliases for existing Fastfile helpers
  export APP_STORE_CONNECT_KEY_IDENTIFIER="$APPLE_KEY_ID"
  cp "$p8_full_path" /tmp/AuthKey.p8
  chmod 600 /tmp/AuthKey.p8
  export FASTLANE_API_KEY_PATH="/tmp/AuthKey.p8"

  # Create API key JSON for match --api_key_path
  # Use ruby to properly escape the P8 key content for JSON
  ruby -rjson -e '
    puts JSON.pretty_generate({
      key_id: ENV["APP_STORE_CONNECT_API_KEY_KEY_ID"],
      issuer_id: ENV["APP_STORE_CONNECT_API_KEY_ISSUER_ID"],
      key: File.read("/tmp/AuthKey.p8"),
      in_house: false
    })
  ' > "$API_KEY_JSON"
  chmod 600 "$API_KEY_JSON"

  echo "App Store Connect API key configured (Key ID: $APPLE_KEY_ID)"
}

# --- Step 4: Create temporary keychain ---
KEYCHAIN_NAME="fastlane_tmp"
KEYCHAIN_DB="$KEYCHAIN_NAME.keychain-db"
KEYCHAIN_PASSWORD=""

setup_keychain() {
  KEYCHAIN_PASSWORD=$(openssl rand -base64 32)

  echo "Creating temporary keychain: $KEYCHAIN_DB"

  # Remove existing keychain if present (idempotent)
  security delete-keychain "$KEYCHAIN_DB" 2>/dev/null || true

  security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_DB"
  security set-keychain-settings -lut 21600 "$KEYCHAIN_DB"
  security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_DB"

  # Add to search list while preserving existing keychains
  local existing_keychains
  existing_keychains=$(security list-keychains -d user | tr -d '"' | tr '\n' ' ')
  security list-keychains -d user -s "$KEYCHAIN_DB" $existing_keychains
  security default-keychain -s "$KEYCHAIN_DB"

  echo "Keychain created and unlocked"
}

# --- Step 5: Install Fastlane if needed ---
install_fastlane() {
  "$COMMON_DIR/install-fastlane.sh" ios
}

# --- Step 6: Run Fastlane Match ---
run_match() {
  echo "Running Fastlane Match..."
  cd "$APP_ROOT/ios"

  MATCH_READONLY="${MATCH_READONLY:-false}"

  bundle exec fastlane match appstore \
    --git_url "$MATCH_GIT_URL" \
    --app_identifier "$BUNDLE_ID" \
    --keychain_name "$KEYCHAIN_DB" \
    --keychain_password "$KEYCHAIN_PASSWORD" \
    --api_key_path "$API_KEY_JSON" \
    --readonly "$MATCH_READONLY"

  echo "Match completed successfully"
}

# --- Step 7: Find provisioning profile UUID ---
PROFILE_UUID=""
TEAM_ID=""

find_profile_uuid() {
  local profiles_dir="$HOME/Library/MobileDevice/Provisioning Profiles"

  if [ ! -d "$profiles_dir" ]; then
    echo "ERROR: Provisioning Profiles directory not found" >&2
    exit 1
  fi

  for profile in "$profiles_dir"/*.mobileprovision; do
    [ -f "$profile" ] || continue
    local plist
    plist=$(security cms -D -i "$profile" 2>/dev/null) || continue
    local profile_app_id
    profile_app_id=$(/usr/libexec/PlistBuddy -c "Print :Entitlements:application-identifier" \
      /dev/stdin <<< "$plist" 2>/dev/null || echo "")
    if [[ "$profile_app_id" == *"$BUNDLE_ID" ]]; then
      PROFILE_UUID=$(/usr/libexec/PlistBuddy -c "Print :UUID" \
        /dev/stdin <<< "$plist" 2>/dev/null || echo "")
      if [ -n "$PROFILE_UUID" ]; then
        echo "Found provisioning profile: $PROFILE_UUID"
        break
      fi
    fi
  done

  if [ -z "$PROFILE_UUID" ]; then
    echo "ERROR: Could not find provisioning profile for $BUNDLE_ID" >&2
    echo "Installed profiles:" >&2
    ls -la "$profiles_dir/" 2>/dev/null || echo "(directory not found)" >&2
    exit 1
  fi
}

find_team_id() {
  # Try extracting from signing identity
  TEAM_ID=$(security find-identity -v -p codesigning "$KEYCHAIN_DB" \
    | grep "Apple Distribution" \
    | head -1 \
    | sed 's/.*(\([A-Z0-9]*\))"/\1/' || echo "")

  if [ -n "$TEAM_ID" ]; then
    return
  fi

  # Fallback: extract from provisioning profile
  local profiles_dir="$HOME/Library/MobileDevice/Provisioning Profiles"
  TEAM_ID=$(/usr/libexec/PlistBuddy -c "Print :TeamIdentifier:0" \
    /dev/stdin <<< "$(security cms -D -i "$profiles_dir/$PROFILE_UUID.mobileprovision" 2>/dev/null)" \
    2>/dev/null || echo "")
}

# --- Step 8: Generate ExportOptions.plist ---
generate_export_options() {
  echo "Generating ExportOptions.plist..."
  local export_options="$PROJECT_ROOT/ios_export_options.plist"
  local profile_name="match AppStore $BUNDLE_ID"

  cat > "$export_options" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>teamID</key>
    <string>${TEAM_ID}</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>${BUNDLE_ID}</key>
        <string>${profile_name}</string>
    </dict>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>
PLIST

  echo "ExportOptions.plist written to $export_options"
}

# --- Step 9: Export outputs ---
export_outputs() {
  local export_options="$PROJECT_ROOT/ios_export_options.plist"
  local -a outputs=(
    "EXPORT_OPTIONS_PLIST=$export_options"
    "KEYCHAIN_NAME=$KEYCHAIN_DB"
    "PROFILE_UUID=$PROFILE_UUID"
    "TEAM_ID=$TEAM_ID"
  )

  if [ -n "${GITHUB_ENV:-}" ]; then
    printf '%s\n' "${outputs[@]}" >> "$GITHUB_ENV"
    echo "Outputs written to GITHUB_ENV"
  else
    echo ""
    echo "=== Local Mode Outputs ==="
    printf '%s\n' "${outputs[@]}"
  fi

  echo ""
  echo "=== Signing Verification ==="
  echo "Installed identities:"
  security find-identity -v -p codesigning "$KEYCHAIN_DB"
  echo ""
  echo "iOS signing setup complete"
}

# --- Main ---
validate_config
setup_ssh_agent
setup_api_key
setup_keychain
install_fastlane
run_match
find_profile_uuid
find_team_id
generate_export_options
export_outputs
