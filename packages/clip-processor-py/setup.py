#!/usr/bin/env python3
"""
Setup script for the Dota 2 Hero Detection API
"""

from setuptools import setup, find_packages

setup(
    name="clip-processor",
    version="0.1.0",
    description="Process Twitch clips to extract player names and ranks and detect Dota 2 heroes",
    author="HubSpot",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "opencv-python==4.11.0.86",
        "pytesseract==0.3.10",
        "moviepy==1.0.3",
        "requests==2.32.4",
        "numpy==1.26.4",
        "Pillow==11.1.0",
        "beautifulsoup4==4.12.2",
        "tqdm==4.66.3",
        "flask==3.0.2",
        "gunicorn==23.0.0",
        "streamlink==6.5.0",
        "psycopg2-binary==2.9.9",
    ],
    entry_points={
        "console_scripts": [
            "clip-processor=src.dota_hero_detection:main",
            "download-heroes=src.dota_heroes:main",
            "api-server=src.api_server:main",
        ],
    },
)
