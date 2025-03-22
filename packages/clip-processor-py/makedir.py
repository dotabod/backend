#!/usr/bin/env python3
"""
Create the necessary directory structure for the clip processor.
"""

import os
from pathlib import Path

# Create the directories
for directory in ["temp", "temp/frames", "assets"]:
    path = Path(directory)
    path.mkdir(exist_ok=True)
    print(f"Created directory: {path}")

# Create a README file in the assets directory
assets_readme = Path("assets/README.txt")
if not assets_readme.exists():
    with open(assets_readme, "w") as f:
        f.write("""
This directory is used for reference images.

To improve recognition accuracy, place a reference image of the player cards dashboard
here and name it "reference.png".

You can also use the download_reference.py script to download a reference image:
python src/download_reference.py URL_TO_REFERENCE_IMAGE
        """.strip())
    print(f"Created file: {assets_readme}")

print("\nDirectory structure ready!")
print("You can now run the clip processor with:")
print("python src/main.py \"clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi\"")
