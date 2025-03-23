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

# Updated API URL from Spectral.gg
HERO_LIST_URL = "https://stats.spectral.gg/lrg2/api/?mod=metadata&gets=heroes&legacyh"
HERO_IMAGE_BASE_URL = "https://courier.spectral.gg/images/dota/portraits_lg/"

def get_hero_list():
    """Fetch the list of Dota 2 heroes from the Spectral.gg API."""
    logger.info(f"Fetching hero list from {HERO_LIST_URL}")

    try:
        response = requests.get(HERO_LIST_URL)
        response.raise_for_status()

        data = response.json()
        heroes = data.get("result", {}).get("heroes", [])

        if not heroes:
            logger.error(f"No heroes found in response: {data}")
            return []

        logger.info(f"Successfully fetched {len(heroes)} heroes")
        return heroes

    except Exception as e:
        logger.error(f"Error fetching hero list: {e}")
        return []

def download_hero_images(heroes):
    """Download hero images for all heroes in the list, including alt icons."""
    logger.info(f"Downloading hero images to {ASSETS_DIR}")

    hero_data = []

    for hero in tqdm(heroes, desc="Downloading hero images"):
        hero_id = hero.get("id")
        full_name = hero.get("name")
        localized_name = hero.get("localized_name")
        tag = hero.get("tag")
        alticons = hero.get("alticons", [])

        # Store all variants for this hero
        hero_variants = []

        # Base hero image
        base_image_url = f"{HERO_IMAGE_BASE_URL}{tag}.png"
        base_filename = f"{hero_id}_base.png"
        base_image_path = ASSETS_DIR / base_filename

        # Download base image if it doesn't exist
        if not base_image_path.exists():
            try:
                logger.debug(f"Downloading base image for {localized_name} from {base_image_url}")
                response = requests.get(base_image_url, stream=True)
                response.raise_for_status()

                with open(base_image_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)

                logger.debug(f"Downloaded base image for {localized_name} to {base_image_path}")
            except Exception as e:
                logger.error(f"Error downloading base image for {localized_name}: {e}")
                # Continue to next hero if base image can't be downloaded
                continue

        # Add base variant to the list
        hero_variants.append({
            "variant": "base",
            "image_path": str(base_image_path),
            "image_url": base_image_url
        })

        # Download all alternate icons
        for alticon in alticons:
            alt_image_url = f"{HERO_IMAGE_BASE_URL}{tag}_{alticon}.png"
            alt_filename = f"{hero_id}_{alticon}.png"
            alt_image_path = ASSETS_DIR / alt_filename

            # Download alt image if it doesn't exist
            if not alt_image_path.exists():
                try:
                    logger.debug(f"Downloading {alticon} image for {localized_name} from {alt_image_url}")
                    response = requests.get(alt_image_url, stream=True)
                    response.raise_for_status()

                    with open(alt_image_path, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=8192):
                            f.write(chunk)

                    logger.debug(f"Downloaded {alticon} image for {localized_name} to {alt_image_path}")
                except Exception as e:
                    logger.error(f"Error downloading {alticon} image for {localized_name}: {e}")
                    # Skip this variant but continue with others
                    continue

            # Add alternate variant to the list
            hero_variants.append({
                "variant": alticon,
                "image_path": str(alt_image_path),
                "image_url": alt_image_url
            })

        # Add hero with all its variants to the hero data
        hero_data.append({
            "id": hero_id,
            "name": full_name,
            "tag": tag,
            "localized_name": localized_name,
            "aliases": hero.get("aliases", ""),
            "alt_name": hero.get("alt_name", ""),
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

    return hero_data

def get_hero_data():
    """Get hero data, downloading images if needed."""
    # Check if we already have the hero data cached
    hero_data_path = ASSETS_DIR / "hero_data.json"

    if hero_data_path.exists():
        try:
            with open(hero_data_path, 'r') as f:
                hero_data = json.load(f)

            logger.info(f"Loaded cached hero data with {len(hero_data)} heroes")

            # Verify that all image files exist
            all_exist = True
            for hero in hero_data:
                for variant in hero.get("variants", []):
                    if not Path(variant["image_path"]).exists():
                        logger.warning(f"Image file missing for {hero['localized_name']} ({variant['variant']}): {variant['image_path']}")
                        all_exist = False
                        break

            if all_exist:
                return hero_data
            else:
                logger.info("Some hero images are missing, will re-download")

        except Exception as e:
            logger.error(f"Error loading cached hero data: {e}")

    # If we reach here, we need to download the hero data
    heroes = get_hero_list()
    return download_hero_images(heroes)

if __name__ == "__main__":
    # When run directly, download all hero images
    hero_data = get_hero_data()

    # Count total variants
    total_variants = sum(len(hero["variants"]) for hero in hero_data)
    print(f"Downloaded {total_variants} hero images for {len(hero_data)} heroes to {ASSETS_DIR}")
