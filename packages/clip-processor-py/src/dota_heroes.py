import os
import json
import requests
import logging
from pathlib import Path
from tqdm import tqdm

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
ASSETS_DIR = Path("assets") / "dota_heroes"
ASSETS_DIR.mkdir(exist_ok=True, parents=True)

# Prefer Valve/OpenDota sources so new heroes are picked up even if the legacy
# Spectral metadata endpoint is unavailable.
VALVE_HERO_LIST_URL = "https://www.dota2.com/datafeed/herolist?language=english"
ODOTA_HERO_LIST_URL = "https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json"
LEGACY_HERO_LIST_URL = "https://stats.spectral.gg/lrg2/api/?mod=metadata&gets=heroes&legacyh"
STEAM_HERO_IMAGE_BASE_URL = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/"
LEGACY_HERO_IMAGE_BASE_URL = "https://courier.spectral.gg/images/dota/portraits_lg/"
HERO_ABILITIES_URL = "https://raw.githubusercontent.com/odota/dotaconstants/refs/heads/master/build/hero_abilities.json"
FACET_ICON_BASE_URL = "https://cdn.akamai.steamstatic.com/apps/dota2/images/dota_react/icons/facets/"
REQUEST_TIMEOUT_SECONDS = 20


def hero_tag_from_internal_name(internal_name):
    """Return the Dota asset tag from an internal hero name."""
    return internal_name.replace("npc_dota_hero_", "", 1)


def steam_hero_image_url(tag):
    """Build the current Valve CDN portrait URL for a hero tag."""
    return f"{STEAM_HERO_IMAGE_BASE_URL}{tag}.png"


def legacy_hero_image_url(tag, variant=None):
    """Build the legacy portrait URL for cached alternate portraits."""
    suffix = f"_{variant}" if variant and variant != "base" else ""
    return f"{LEGACY_HERO_IMAGE_BASE_URL}{tag}{suffix}.png"


def normalize_hero(hero):
    """Normalize hero metadata from Valve, OpenDota, or the legacy Spectral API."""
    internal_name = hero.get("name", "")
    tag = hero.get("tag") or hero_tag_from_internal_name(internal_name)
    localized_name = (
        hero.get("localized_name")
        or hero.get("name_english_loc")
        or hero.get("name_loc")
        or tag.replace("_", " ").title()
    )

    return {
        "id": hero.get("id"),
        "name": internal_name or f"npc_dota_hero_{tag}",
        "tag": tag,
        "localized_name": localized_name,
        "aliases": hero.get("aliases", ""),
        "alt_name": hero.get("alt_name", ""),
        "alticons": hero.get("alticons", []),
    }


def load_cached_hero_data(hero_data_path):
    """Load cached hero data if available."""
    if not hero_data_path.exists():
        return None

    try:
        with open(hero_data_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading cached hero data: {e}")
        return None


def hero_roster_signature(hero_data):
    """Build a stable signature for deciding when template cache is stale."""
    return [
        (
            hero.get("id"),
            hero.get("name"),
            hero.get("tag"),
            hero.get("localized_name"),
            tuple(
                (variant.get("variant"), variant.get("image_path"))
                for variant in hero.get("variants", [])
            ),
        )
        for hero in hero_data or []
    ]


def all_variant_images_exist(hero_data):
    """Return whether all cached variant files exist on disk."""
    for hero in hero_data or []:
        for variant in hero.get("variants", []):
            if not Path(variant["image_path"]).exists():
                logger.warning(
                    f"Image file missing for {hero['localized_name']} "
                    f"({variant['variant']}): {variant['image_path']}"
                )
                return False
    return True


def get_missing_expected_variants(cached_hero_data, heroes):
    """Return variants expected by live metadata but missing from cached hero data."""
    cached_by_id = {
        hero.get("id"): hero
        for hero in cached_hero_data or []
    }
    missing_variants = []

    for hero in heroes or []:
        cached_hero = cached_by_id.get(hero.get("id"))
        if not cached_hero:
            continue

        expected_variants = {"base", *hero.get("alticons", [])}
        cached_variants = {
            variant.get("variant")
            for variant in cached_hero.get("variants", [])
        }

        for variant in sorted(expected_variants - cached_variants):
            missing_variants.append((hero.get("id"), hero.get("localized_name"), variant))

    return missing_variants


def invalidate_template_cache():
    """Remove the precomputed template cache after roster or image changes."""
    cache_path = ASSETS_DIR / "templates_cache.npz"
    if cache_path.exists():
        try:
            cache_path.unlink()
            logger.info(f"Removed stale template cache: {cache_path}")
        except Exception as e:
            logger.warning(f"Failed to remove stale template cache {cache_path}: {e}")


def get_hero_list():
    """Fetch the current Dota 2 hero list and augment it with portrait variants."""
    source_results = {}

    for source_name, source_url, parser in (
        ("Valve", VALVE_HERO_LIST_URL, parse_valve_hero_list),
        ("OpenDota", ODOTA_HERO_LIST_URL, parse_odota_hero_list),
        ("Spectral", LEGACY_HERO_LIST_URL, parse_legacy_hero_list),
    ):
        logger.info(f"Fetching hero list from {source_name}: {source_url}")
        try:
            response = requests.get(source_url, timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            heroes = parser(response.json())

            if heroes:
                logger.info(f"Successfully fetched {len(heroes)} heroes from {source_name}")
                source_results[source_name] = heroes
                continue

            logger.warning(f"No heroes found in {source_name} response")
        except Exception as e:
            logger.warning(f"Error fetching hero list from {source_name}: {e}")

    heroes = (
        source_results.get("Valve")
        or source_results.get("OpenDota")
        or source_results.get("Spectral")
        or []
    )

    if not heroes:
        logger.error("Unable to fetch hero list from any source")
        return []

    spectral_heroes = source_results.get("Spectral")
    if spectral_heroes and spectral_heroes is not heroes:
        heroes = merge_hero_metadata(heroes, spectral_heroes)
        logger.info("Augmented hero list with Spectral portrait variant metadata")

    return heroes


def parse_valve_hero_list(data):
    """Parse Valve's Dota datafeed hero response."""
    heroes = data.get("result", {}).get("data", {}).get("heroes", [])
    return [normalize_hero(hero) for hero in heroes]


def parse_odota_hero_list(data):
    """Parse OpenDota dotaconstants hero metadata."""
    heroes = data.values() if isinstance(data, dict) else data
    return [normalize_hero(hero) for hero in heroes]


def parse_legacy_hero_list(data):
    """Parse the legacy Spectral hero response used by earlier builds."""
    heroes = data.get("result", {}).get("heroes", [])
    return [normalize_hero(hero) for hero in heroes]


def merge_hero_metadata(base_heroes, augmenting_heroes):
    """Merge richer metadata such as Spectral alticons into the current roster."""
    augmenting_by_id = {
        hero.get("id"): hero
        for hero in augmenting_heroes
    }
    merged_heroes = []

    for hero in base_heroes:
        merged_hero = dict(hero)
        augmenting_hero = augmenting_by_id.get(hero.get("id"))

        if augmenting_hero:
            for field in ("aliases", "alt_name"):
                if not merged_hero.get(field) and augmenting_hero.get(field):
                    merged_hero[field] = augmenting_hero[field]

            merged_alticons = set(merged_hero.get("alticons", []))
            merged_alticons.update(augmenting_hero.get("alticons", []))
            merged_hero["alticons"] = sorted(merged_alticons)

        merged_heroes.append(merged_hero)

    return merged_heroes


def download_image(image_url, image_path, description):
    """Download an image if it is not already present."""
    if image_path.exists():
        return False

    try:
        logger.debug(f"Downloading {description} from {image_url}")
        response = requests.get(image_url, stream=True, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()

        with open(image_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        logger.debug(f"Downloaded {description} to {image_path}")
        return True
    except Exception as e:
        logger.error(f"Error downloading {description}: {e}")
        return False


def merge_hero_variants(hero, existing_hero):
    """Merge current hero metadata with cached base and alternate portrait variants."""
    hero_id = hero.get("id")
    tag = hero.get("tag")
    existing_variants = {
        variant.get("variant"): dict(variant)
        for variant in (existing_hero or {}).get("variants", [])
        if variant.get("variant")
    }

    base_variant = existing_variants.pop("base", {})
    base_variant.update({
        "variant": "base",
        "image_path": str(ASSETS_DIR / f"{hero_id}_base.png"),
        "image_url": steam_hero_image_url(tag),
    })

    variants = [base_variant]

    for alticon in hero.get("alticons", []):
        if alticon not in existing_variants:
            existing_variants[alticon] = {
                "variant": alticon,
                "image_path": str(ASSETS_DIR / f"{hero_id}_{alticon}.png"),
                "image_url": legacy_hero_image_url(tag, alticon),
            }

    variants.extend(existing_variants[variant] for variant in sorted(existing_variants))
    return variants


def download_hero_images(heroes, existing_hero_data=None):
    """Download hero images for all heroes in the list, including alt icons."""
    logger.info(f"Downloading hero images to {ASSETS_DIR}")

    hero_data = []
    existing_by_id = {
        hero.get("id"): hero
        for hero in existing_hero_data or []
    }
    downloaded_any = False

    for hero in tqdm(heroes, desc="Downloading hero images"):
        hero_id = hero.get("id")
        full_name = hero.get("name")
        localized_name = hero.get("localized_name")
        tag = hero.get("tag")
        existing_hero = existing_by_id.get(hero_id)
        hero_variants = []

        for variant in merge_hero_variants(hero, existing_hero):
            variant_name = variant.get("variant")
            image_path = Path(variant["image_path"])
            image_url = variant["image_url"]
            description = f"{localized_name} {variant_name} portrait"

            if not image_path.exists():
                downloaded = download_image(image_url, image_path, description)
                downloaded_any = downloaded_any or downloaded

            if image_path.exists():
                hero_variants.append(variant)
            elif variant_name == "base":
                logger.error(f"Skipping {localized_name}: base portrait could not be downloaded")
                break
            else:
                logger.warning(f"Skipping missing alternate portrait for {localized_name}: {variant_name}")

        if not hero_variants:
            continue

        # Add hero with all its variants to the hero data
        hero_data.append({
            "id": hero_id,
            "name": full_name,
            "tag": tag,
            "localized_name": localized_name,
            "aliases": (existing_hero or {}).get("aliases", hero.get("aliases", "")),
            "alt_name": (existing_hero or {}).get("alt_name", hero.get("alt_name", "")),
            "variants": hero_variants
        })

    # Count total variants downloaded
    total_variants = sum(len(hero["variants"]) for hero in hero_data)
    logger.info(f"Successfully downloaded {total_variants} hero images for {len(hero_data)} heroes")

    # Save hero data to a JSON file for later use
    hero_data_path = ASSETS_DIR / "hero_data.json"
    with open(hero_data_path, 'w') as f:
        json.dump(hero_data, f, indent=2)

    logger.info(f"Hero data saved to {hero_data_path}")

    if downloaded_any:
        invalidate_template_cache()

    return hero_data

def download_hero_abilities():
    """Download and store hero abilities data from OpenDota's dotaconstants repository."""
    logger.info(f"Downloading hero abilities data from {HERO_ABILITIES_URL}")

    try:
        response = requests.get(HERO_ABILITIES_URL, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()

        abilities_data = response.json()

        # Save abilities data to a JSON file
        abilities_path = ASSETS_DIR / "hero_abilities.json"
        with open(abilities_path, 'w') as f:
            json.dump(abilities_data, f, indent=2)

        logger.info(f"Hero abilities data saved to {abilities_path}")

        # Create a directory for facet icons
        facets_dir = ASSETS_DIR / "facet_icons"
        facets_dir.mkdir(exist_ok=True)

        # Download facet icons for each hero
        for hero_id, hero_data in abilities_data.items():
            if 'facets' in hero_data:
                for facet in hero_data['facets']:
                    icon_name = facet.get('icon')
                    if icon_name:
                        icon_url = f"{FACET_ICON_BASE_URL}{icon_name}.png"
                        icon_path = facets_dir / f"{icon_name}.png"

                        if not icon_path.exists():
                            try:
                                logger.debug(f"Downloading facet icon {icon_name} from {icon_url}")
                                response = requests.get(
                                    icon_url,
                                    stream=True,
                                    timeout=REQUEST_TIMEOUT_SECONDS
                                )
                                response.raise_for_status()

                                with open(icon_path, 'wb') as f:
                                    for chunk in response.iter_content(chunk_size=8192):
                                        f.write(chunk)

                                logger.debug(f"Downloaded facet icon {icon_name} to {icon_path}")
                            except Exception as e:
                                logger.error(f"Error downloading facet icon {icon_name}: {e}")
                                continue

        return abilities_data
    except Exception as e:
        logger.error(f"Error downloading hero abilities data: {e}")
        return None


def add_abilities_to_hero_data(hero_data, abilities_data):
    """Attach ability metadata to each hero record when available."""
    if not abilities_data:
        return hero_data

    for hero in hero_data:
        hero_id = f"npc_dota_hero_{hero['tag']}"
        if hero_id in abilities_data:
            hero['abilities'] = abilities_data[hero_id]

    return hero_data


def get_hero_data(refresh=True):
    """Get hero data, downloading images if needed."""
    # Check if we already have the hero data cached
    hero_data_path = ASSETS_DIR / "hero_data.json"
    abilities_path = ASSETS_DIR / "hero_abilities.json"

    # Load abilities data first. Refreshing keeps facets current for newly added heroes.
    abilities_data = None
    if abilities_path.exists():
        try:
            with open(abilities_path, 'r') as f:
                abilities_data = json.load(f)
            logger.info("Loaded cached hero abilities data")
        except Exception as e:
            logger.error(f"Error loading cached hero abilities data: {e}")

    if refresh or not abilities_data:
        refreshed_abilities = download_hero_abilities()
        if refreshed_abilities:
            abilities_data = refreshed_abilities

    cached_hero_data = load_cached_hero_data(hero_data_path)
    cached_signature = hero_roster_signature(cached_hero_data)

    if cached_hero_data:
        logger.info(f"Loaded cached hero data with {len(cached_hero_data)} heroes")

    heroes = get_hero_list() if refresh or not cached_hero_data else []

    if cached_hero_data and heroes:
        cached_ids = {hero.get("id") for hero in cached_hero_data}
        current_ids = {hero.get("id") for hero in heroes}
        missing_ids = sorted(current_ids - cached_ids)
        missing_variants = get_missing_expected_variants(cached_hero_data, heroes)
        cached_images_exist = all_variant_images_exist(cached_hero_data)

        if not missing_ids and not missing_variants and cached_images_exist:
            logger.info("Cached hero data is current")
            return add_abilities_to_hero_data(cached_hero_data, abilities_data)

        if missing_ids:
            logger.info(f"Cached hero data is missing hero IDs: {missing_ids}")
        elif missing_variants:
            logger.info(f"Cached hero data is missing portrait variants: {missing_variants}")
        else:
            logger.info("Some hero images are missing, will re-download")

    elif cached_hero_data and not heroes:
        logger.warning("Using cached hero data because live hero list could not be fetched")
        if all_variant_images_exist(cached_hero_data):
            return add_abilities_to_hero_data(cached_hero_data, abilities_data)

        logger.info("Cached hero data has missing images and no live source is available")

    # If we reach here, we need to download the hero data
    if not heroes:
        logger.error("No hero list available and cached hero data is unusable")
        return []

    hero_data = download_hero_images(heroes, existing_hero_data=cached_hero_data)

    if hero_roster_signature(hero_data) != cached_signature:
        invalidate_template_cache()

    return add_abilities_to_hero_data(hero_data, abilities_data)


def main():
    """Download or refresh hero metadata and portrait assets."""
    hero_data = get_hero_data(refresh=True)

    # Count total variants
    total_variants = sum(len(hero["variants"]) for hero in hero_data)
    print(f"Downloaded {total_variants} hero images for {len(hero_data)} heroes to {ASSETS_DIR}")
    return 0 if hero_data else 1


if __name__ == "__main__":
    # When run directly, download all hero images
    raise SystemExit(main())
