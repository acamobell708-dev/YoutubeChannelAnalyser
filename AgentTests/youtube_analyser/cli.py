"""Command-line interface for analysing a single YouTube video."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from .config import ConfigurationError, load_settings
from .models import VideoAnalysis
from .sanity import run_sanity_checks
from .summarizer import CommentSummarizer, SummaryError
from .youtube_client import YouTubeClient, YouTubeExtractionError


def _bounded_comment_limit(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if not 1 <= parsed <= 500:
        raise argparse.ArgumentTypeError("must be between 1 and 500")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Print a YouTube video's view count and an AI-generated summary of "
            "a sample of its public comments."
        )
    )
    parser.add_argument(
        "url",
        nargs="?",
        help="Full YouTube video URL (prompted for when omitted)",
    )
    parser.add_argument(
        "--max-comments",
        type=_bounded_comment_limit,
        default=100,
        help="Maximum number of top-level comments to retrieve (default: 100)",
    )
    return parser


def _get_video_url(url: str | None) -> str:
    """Return a supplied URL or prompt for one during an interactive run."""
    if url is not None:
        return url.strip()

    print("YouTube Video Comment Analyser")
    print("-" * 32)
    try:
        return input("Enter the YouTube video URL: ").strip()
    except EOFError:
        return ""


def _print_report(analysis: VideoAnalysis) -> None:
    video = analysis.video
    print()
    print("=" * 72)
    print(video.title)
    print("=" * 72)
    print(f"Channel:       {video.channel}")
    print(f"Video ID:      {video.video_id}")
    print(f"Views:         {video.view_count:,}")
    if video.reported_comment_count is not None:
        print(f"Comments:      {video.reported_comment_count:,} reported by YouTube")
    print(f"Sampled:       {len(video.comments):,} comments")
    print()
    print("Comment summary")
    print("-" * 72)
    print(analysis.comment_summary)


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        video_url = _get_video_url(args.url)
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130

    if not video_url:
        print("Error: A YouTube video URL is required.", file=sys.stderr)
        return 2

    try:
        settings = load_settings()
        print("Retrieving public video data and comments...")
        video = YouTubeClient().fetch(video_url, max_comments=args.max_comments)

        print(
            f"Retrieved {len(video.comments):,} comments. "
            f"Summarising with {settings.openai_model}..."
        )
        summary = CommentSummarizer(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
        ).summarize(video)
        analysis = VideoAnalysis(video=video, comment_summary=summary)

        _print_report(analysis)

        sanity = run_sanity_checks(analysis)
        print()
        if not sanity.passed:
            print("[SANITY CHECK: FAILED]")
            for error in sanity.errors:
                print(f"  - {error}")
            return 1

        print("[SANITY CHECK: PASSED]")
        for check in sanity.checks:
            print(f"  - {check}")
        return 0

    except (
        ConfigurationError,
        YouTubeExtractionError,
        SummaryError,
    ) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
