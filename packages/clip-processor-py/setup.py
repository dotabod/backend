#!/usr/bin/env python3
"""
Setup script for the Dota 2 Hero Detection API
"""

from pathlib import Path

from setuptools import find_packages, setup

requirements = Path(__file__).with_name("requirements.txt").read_text(encoding="utf-8")
runtime_dependencies = [
    line
    for raw_line in requirements.splitlines()
    if (line := raw_line.strip()) and not line.startswith("#")
]

setup(
    name="clip-processor",
    version="0.1.0",
    description="Process Twitch clips to extract player names and ranks and detect Dota 2 heroes",
    author="HubSpot",
    packages=find_packages(),
    python_requires=">=3.11,<3.13",
    install_requires=runtime_dependencies,
    entry_points={
        "console_scripts": [
            "clip-processor=src.dota_hero_detection:main",
            "download-heroes=src.dota_heroes:main",
            "api-server=src.api_server:main",
        ],
    },
)
