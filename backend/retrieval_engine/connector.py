"""
Connector — Phase 3

Makes HTTP GET requests to the mock government portal.
Uses the source registry to build URLs deterministically.

No AI, no guessing. The registry defines the source; the connector
just executes the HTTP call and returns the raw response.
"""
import urllib.request
import urllib.error
import json
from typing import Optional, Tuple

from ..source_registry.registry import build_url, get_category

DEFAULT_TIMEOUT = 10   # seconds


def fetch_category(
    parcel_id: str,
    category_code: str,
    base_url: str,
    timeout: int = DEFAULT_TIMEOUT,
) -> Tuple[Optional[dict], int, Optional[str]]:
    """
    Fetch one category for one parcel from the mock government portal.

    Uses only stdlib urllib (no external dependency) so it works
    before the virtual-env is fully set up.

    Returns:
        (response_dict, http_status, error_message)
        On success: ({"status":"success", "availability":..., ...}, 200, None)
        On HTTP error: (None, status_code, error_text)
        On connection error: (None, 0, error_text)
    """
    config = get_category(category_code)
    if not config:
        return None, 0, f"Unknown category code: '{category_code}'"

    url = build_url(category_code, parcel_id, base_url)
    if not url:
        return None, 0, "Could not build URL from registry"

    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body), resp.status, None

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        return None, e.code, f"HTTP {e.code}: {body[:200]}"

    except urllib.error.URLError as e:
        return None, 0, f"Connection error: {e.reason}"

    except json.JSONDecodeError as e:
        return None, 0, f"Invalid JSON in response: {e}"

    except Exception as e:
        return None, 0, f"Unexpected error: {type(e).__name__}: {e}"
