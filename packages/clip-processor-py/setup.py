#!/usr/bin/env python3
"""
Setup script for the Twitch Clip Processor
"""

from setuptools import setup, find_packages

setup(
    name="clip-processor",
    version="0.1.0",
    description="Process Twitch clips to extract player names and ranks",
    author="HubSpot",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "opencv-python==4.11.0.86",
        "pytesseract==0.3.10",
        "moviepy==1.0.3",
        "requests==2.31.0",
        "numpy==1.26.4",
        "Pillow==11.1.0",
        "beautifulsoup4==4.12.2",
        "tqdm==4.66.1",
    ],
    entry_points={
        "console_scripts": [
            "clip-processor=main:main",
            "download-reference=download_reference:main",
        ],
    },
)
