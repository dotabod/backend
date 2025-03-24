#!/usr/bin/env python3
"""
Process multiple Twitch clips to extract Dota 2 heroes and player information.
This script takes a list of clip URLs and processes each one sequentially,
saving the results to individual JSON files.
"""

import os
import sys
import json
import logging
import argparse
import concurrent.futures
from pathlib import Path
import time

# Import the hero detection module
try:
    from dota_hero_detection import process_frames_for_heroes, get_clip_details, download_clip, extract_frames
except ImportError:
    print("Error: Could not import dota_hero_detection module")
    print("Make sure you're running this script from the packages/clip-processor-py directory")
    sys.exit(1)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Output directory
OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

def process_clip(clip_url, args):
    """Process a single clip and save the results to a JSON file."""
    try:
        # Extract clip ID from URL
        clip_id = clip_url.split("/")[-1].split("-")[0]
        output_file = OUTPUT_DIR / f"{clip_id}.json"

        logger.info(f"Processing clip: {clip_url}")

        # Get clip details
        clip_details = get_clip_details(clip_url)
        if not clip_details:
            logger.error(f"Failed to get clip details for {clip_url}")
            return False, clip_url, "Failed to get clip details"

        # Download the clip
        clip_path = download_clip(clip_details)
        if not clip_path:
            logger.error(f"Failed to download clip: {clip_url}")
            return False, clip_url, "Failed to download clip"

        # Extract frames
        frame_paths = extract_frames(clip_path, frame_interval=10)
        if not frame_paths:
            logger.error(f"Failed to extract frames from clip: {clip_url}")
            return False, clip_url, "Failed to extract frames"

        # Process frames to detect heroes and players
        heroes = process_frames_for_heroes(frame_paths, debug=args.debug)
        if not heroes:
            logger.warning(f"No heroes detected in clip: {clip_url}")
            return False, clip_url, "No heroes detected"

        # Create a more accessible players structure
        players = []
        for hero in heroes:
            player = {
                'position': hero['position'] + 1,  # 1-indexed position for users
                'team': hero['team'],
                'hero': hero['hero_localized_name'],
                'hero_id': hero.get('hero_id')
            }

            # Add player name if available
            if 'player_name' in hero:
                player['name'] = hero['player_name']

            # Add rank if available
            if 'rank' in hero:
                player['rank'] = hero['rank']

            players.append(player)

        # Add clip metadata
        result = {
            'clip_url': clip_url,
            'clip_id': clip_id,
            'clip_title': clip_details.get('title', ''),
            'broadcaster': clip_details.get('broadcaster', {}).get('name', ''),
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
            'players': players,
            'heroes': heroes  # Include detailed hero data if needed
        }

        # Save to JSON file
        with open(output_file, 'w') as f:
            json.dump(result, f, indent=2)

        logger.info(f"Successfully processed clip: {clip_url}")
        logger.info(f"Results saved to: {output_file}")

        return True, clip_url, output_file

    except Exception as e:
        logger.error(f"Error processing clip {clip_url}: {e}")
        return False, clip_url, f"Error: {str(e)}"

def process_clips_parallel(clip_urls, args):
    """Process multiple clips in parallel using a thread pool."""
    results = {
        'success': [],
        'failed': []
    }

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_to_url = {executor.submit(process_clip, url, args): url for url in clip_urls}

        for future in concurrent.futures.as_completed(future_to_url):
            url = future_to_url[future]
            try:
                success, clip_url, output = future.result()
                if success:
                    results['success'].append({
                        'clip_url': clip_url,
                        'output_file': str(output)
                    })
                else:
                    results['failed'].append({
                        'clip_url': clip_url,
                        'reason': output
                    })
            except Exception as e:
                logger.error(f"Error processing {url}: {e}")
                results['failed'].append({
                    'clip_url': url,
                    'reason': str(e)
                })

    return results

def process_clips_sequential(clip_urls, args):
    """Process multiple clips sequentially."""
    results = {
        'success': [],
        'failed': []
    }

    for url in clip_urls:
        success, clip_url, output = process_clip(url, args)
        if success:
            results['success'].append({
                'clip_url': clip_url,
                'output_file': str(output)
            })
        else:
            results['failed'].append({
                'clip_url': clip_url,
                'reason': output
            })

    return results

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description="Process multiple Twitch clips to extract Dota 2 heroes and player information")
    parser.add_argument("--input", "-i", default="clips.json",
                       help="JSON file containing an array of clip URLs (default: clips.json)")
    parser.add_argument("--output", "-o", default="results.json",
                       help="Output JSON file for processing results summary (default: results.json)")
    parser.add_argument("--debug", action="store_true",
                       help="Enable debug mode")
    parser.add_argument("--parallel", action="store_true",
                       help="Process clips in parallel")
    parser.add_argument("--workers", type=int, default=3,
                       help="Number of worker threads when using parallel processing (default: 3)")

    args = parser.parse_args()

    # Create the output directory
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Load clip URLs
    try:
        if os.path.exists(args.input):
            with open(args.input, 'r') as f:
                clip_urls = json.load(f)
        else:
            # If the input file doesn't exist, use hardcoded list
            clip_urls = [
                "clips.twitch.tv/BovineGlamorousWaffleTooSpicy-F_iPGjTiRNHaGoTp",
                "clips.twitch.tv/FunHappyPorcupineTinyFace-ylxA3Fvsj6-InAlV",
                "clips.twitch.tv/DullJazzyGiraffeImGlitch-hzJrIKKeT2KGeAe1",
                "clips.twitch.tv/CrepuscularSneakyMangoPeteZaroll-kv4D_5gDsjseGDXy",
                "clips.twitch.tv/TolerantReliableSmoothieCorgiDerp-eEaAKZRnUdPZTrp8",
                "clips.twitch.tv/BusyEsteemedMooseTBCheesePull-owpvs-N_HB_NGLAu",
                "clips.twitch.tv/SucculentWealthyShrewBigBrother-w2isvSN2JApe75z4",
                "clips.twitch.tv/AffluentTalentedUdonGingerPower-2aP3120LA2HsMsXS",
                "clips.twitch.tv/CrispyHorriblePlumRaccAttack-7aafDv6JFk4S3iB3",
                "clips.twitch.tv/PhilanthropicAmorphousNoodleVoteNay-DSSkiOv_VUPtZuAY",
                "clips.twitch.tv/SoftPluckyCroissantCopyThis-_gl5G2B_5dtijsDb",
                "clips.twitch.tv/AffluentMoldyCheetahM4xHeh-_g1No8mdzKGJ8llL",
                "clips.twitch.tv/RefinedStrongPuddingPMSTwin-opEr8bGzF7hThn_3",
                "clips.twitch.tv/BashfulSpicyMushroomLeeroyJenkins-rqc5kQTZNM1MaNPH",
                "clips.twitch.tv/ShinyNimbleBatFutureMan-EItfRmRCD1Ebs0JL",
                "clips.twitch.tv/LongFaintWebPanicBasket-Ql1T5Y7_D47nrBfl",
                "clips.twitch.tv/ThankfulHyperBunnyGOWSkull-wpXg9Y6dRaVWHlBv",
                "clips.twitch.tv/HonorablePhilanthropicDotterelBudStar-gmoctZHZKpMoZkV-",
                "clips.twitch.tv/PoisedBashfulTaroPastaThat-iUbzcqizZLcxCJwp"
            ]

            # Add https:// prefix if missing
            clip_urls = ["https://" + url if not url.startswith("http") else url for url in clip_urls]

            # Save the list to the input file for future use
            with open(args.input, 'w') as f:
                json.dump(clip_urls, f, indent=2)

        logger.info(f"Found {len(clip_urls)} clips to process")

        # Process clips
        start_time = time.time()

        if args.parallel:
            logger.info(f"Processing clips in parallel with {args.workers} workers")
            results = process_clips_parallel(clip_urls, args)
        else:
            logger.info("Processing clips sequentially")
            results = process_clips_sequential(clip_urls, args)

        # Calculate statistics
        total_time = time.time() - start_time
        success_count = len(results['success'])
        failed_count = len(results['failed'])
        total_count = success_count + failed_count

        # Add summary to results
        results['summary'] = {
            'total_clips': total_count,
            'successful': success_count,
            'failed': failed_count,
            'success_rate': f"{(success_count / total_count) * 100:.1f}%" if total_count > 0 else "0%",
            'total_time': f"{total_time:.2f} seconds",
            'average_time': f"{total_time / total_count:.2f} seconds per clip" if total_count > 0 else "N/A"
        }

        # Save results summary
        with open(args.output, 'w') as f:
            json.dump(results, f, indent=2)

        # Print summary
        print(f"\nProcessing complete!")
        print(f"Total clips: {total_count}")
        print(f"Successfully processed: {success_count}")
        print(f"Failed: {failed_count}")
        print(f"Success rate: {results['summary']['success_rate']}")
        print(f"Total processing time: {results['summary']['total_time']}")
        print(f"Average processing time: {results['summary']['average_time']}")
        print(f"\nDetailed results saved to: {args.output}")
        print(f"Individual clip results saved to: {OUTPUT_DIR}/")

        if failed_count > 0:
            print("\nFailed clips:")
            for i, failed in enumerate(results['failed'], 1):
                print(f"{i}. {failed['clip_url']} - Reason: {failed['reason']}")

        return 0

    except Exception as e:
        logger.error(f"Error in main function: {e}")
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
