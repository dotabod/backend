import os
import json
import requests
import logging
import cv2
import numpy as np
from pathlib import Path
from tqdm import tqdm

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
ASSETS_DIR = Path("assets") / "dota_heroes"
ASSETS_DIR.mkdir(exist_ok=True, parents=True)

HERO_LIST_URL = "https://www.dota2.com/datafeed/herolist?language=english"
HERO_IMAGE_BASE_URL = "https://cdn.akamai.steamstatic.com/apps/dota2/images/dota_react/heroes/"

def convert_to_jpg(image_path):
    """
    Convert a PNG image to JPG to avoid libpng warnings.
    Returns the path to the new JPG file.
    """
    try:
        # Load the image with safe flags
        image = cv2.imread(str(image_path), cv2.IMREAD_IGNORE_ORIENTATION | cv2.IMREAD_COLOR)
        if image is None:
            logger.error(f"Failed to load image: {image_path}")
            return image_path

        # Create a new filename with jpg extension
        jpg_path = image_path.with_suffix('.jpg')

        # Save as JPG with high quality
        cv2.imwrite(str(jpg_path), image, [cv2.IMWRITE_JPEG_QUALITY, 100])

        # Delete the original PNG if the JPG was created successfully
        if jpg_path.exists() and jpg_path.stat().st_size > 0:
            image_path.unlink(missing_ok=True)
            logger.debug(f"Converted {image_path} to {jpg_path}")
            return jpg_path
        else:
            logger.warning(f"Failed to convert {image_path} to JPG")
            return image_path
    except Exception as e:
        logger.error(f"Error converting {image_path} to JPG: {e}")
        return image_path

def get_hero_list():
    """Fetch the list of Dota 2 heroes from the official API."""
    logger.info(f"Fetching hero list from {HERO_LIST_URL}")

    try:
        response = requests.get(HERO_LIST_URL)
        response.raise_for_status()

        data = response.json()
        heroes = data.get("result", {}).get("data", {}).get("heroes", [])

        if not heroes:
            logger.error(f"No heroes found in response: {data}")
            return []

        logger.info(f"Successfully fetched {len(heroes)} heroes")
        return heroes

    except Exception as e:
        logger.error(f"Error fetching hero list: {e}")
        return []

def extract_hero_name_for_image(hero_name):
    """Extract the hero name suitable for the image URL from the full hero name."""
    # Remove the prefix "npc_dota_hero_" to get the image name
    if hero_name.startswith("npc_dota_hero_"):
        return hero_name[14:]  # Remove the first 14 characters
    return hero_name

def download_hero_images(heroes):
    """Download hero images for all heroes in the list."""
    logger.info(f"Downloading hero images to {ASSETS_DIR}")

    downloaded_images = []

    for hero in tqdm(heroes, desc="Downloading hero images"):
        hero_id = hero.get("id")
        full_name = hero.get("name")
        localized_name = hero.get("name_english_loc")

        # Extract the image name part from the full hero name
        image_name = extract_hero_name_for_image(full_name)
        image_url = f"{HERO_IMAGE_BASE_URL}{image_name}.png"

        # Create a filename that includes the hero ID - use jpg extension
        filename = f"{hero_id}.jpg"
        image_path = ASSETS_DIR / filename
        temp_png_path = ASSETS_DIR / f"{hero_id}_temp.png"

        # Skip if the image already exists
        if image_path.exists():
            logger.debug(f"Image already exists for {localized_name} at {image_path}, skipping")
            downloaded_images.append({
                "id": hero_id,
                "name": full_name,
                "localized_name": localized_name,
                "image_path": str(image_path),
                "image_name": image_name
            })
            continue

        try:
            logger.debug(f"Downloading image for {localized_name} from {image_url}")
            response = requests.get(image_url, stream=True)
            response.raise_for_status()

            # First save as temporary PNG
            with open(temp_png_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            # Convert to JPG and remove the PNG
            if temp_png_path.exists():
                # Load the PNG with safe flags
                image = cv2.imread(str(temp_png_path), cv2.IMREAD_IGNORE_ORIENTATION | cv2.IMREAD_COLOR)
                if image is not None:
                    # Save as JPG with high quality
                    cv2.imwrite(str(image_path), image, [cv2.IMWRITE_JPEG_QUALITY, 100])
                    # Delete the temporary PNG
                    temp_png_path.unlink(missing_ok=True)
                else:
                    logger.warning(f"Failed to load downloaded image for {localized_name}")
                    continue

            logger.debug(f"Downloaded and converted image for {localized_name} to {image_path}")

            downloaded_images.append({
                "id": hero_id,
                "name": full_name,
                "localized_name": localized_name,
                "image_path": str(image_path),
                "image_name": image_name
            })

        except Exception as e:
            logger.error(f"Error downloading image for {localized_name}: {e}")

    logger.info(f"Successfully downloaded {len(downloaded_images)} hero images")

    # Save hero data to a JSON file for later use
    hero_data_path = ASSETS_DIR / "hero_data.json"
    with open(hero_data_path, 'w') as f:
        json.dump(downloaded_images, f, indent=2)

    logger.info(f"Hero data saved to {hero_data_path}")

    return downloaded_images

def get_hero_data():
    """Get hero data, downloading images if needed."""
    # Check if we already have the hero data cached
    hero_data_path = ASSETS_DIR / "hero_data.json"

    if hero_data_path.exists():
        try:
            with open(hero_data_path, 'r') as f:
                hero_data = json.load(f)

            logger.info(f"Loaded cached hero data with {len(hero_data)} heroes")

            # Check for PNG images that need conversion to JPG
            for hero in hero_data:
                image_path = Path(hero["image_path"])
                if image_path.suffix.lower() == '.png':
                    logger.info(f"Converting PNG to JPG: {image_path}")
                    # Convert to JPG to avoid libpng warnings
                    new_path = convert_to_jpg(image_path)
                    # Update the path in the hero data
                    hero["image_path"] = str(new_path)

            # Verify that all image files exist
            all_exist = True
            for hero in hero_data:
                if not Path(hero["image_path"]).exists():
                    logger.warning(f"Image file missing for {hero['localized_name']}: {hero['image_path']}")
                    all_exist = False
                    break

            if all_exist:
                # If we converted any PNG images, save the updated paths
                if any(Path(hero["image_path"]).suffix.lower() == '.jpg' for hero in hero_data):
                    with open(hero_data_path, 'w') as f:
                        json.dump(hero_data, f, indent=2)
                    logger.info("Updated hero data with JPG paths")
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
    print(f"Downloaded {len(hero_data)} hero images to {ASSETS_DIR}")
