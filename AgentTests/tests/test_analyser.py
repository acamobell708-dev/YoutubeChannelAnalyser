"""Offline unit and sanity tests."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from youtube_analyser.cli import _get_video_url
from youtube_analyser.models import VideoAnalysis
from youtube_analyser.sanity import run_sanity_checks
from youtube_analyser.summarizer import CommentSummarizer
from youtube_analyser.youtube_client import (
    YouTubeExtractionError,
    extract_video_id,
    normalise_video_data,
    validate_youtube_url,
)


TEST_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


class FakeResponses:
    def create(self, **_: object) -> SimpleNamespace:
        return SimpleNamespace(
            output_text=(
                "- Viewers are broadly positive.\n"
                "- Several comments mention the memorable performance."
            )
        )


class FakeOpenAIClient:
    def __init__(self) -> None:
        self.responses = FakeResponses()


class URLTests(unittest.TestCase):
    def test_prompts_for_url_when_not_supplied(self) -> None:
        with patch("builtins.input", return_value=f"  {TEST_URL}  "):
            self.assertEqual(_get_video_url(None), TEST_URL)

    def test_keeps_command_line_url_support(self) -> None:
        self.assertEqual(_get_video_url(f"  {TEST_URL}  "), TEST_URL)

    def test_extracts_common_video_ids(self) -> None:
        self.assertEqual(extract_video_id(TEST_URL), "dQw4w9WgXcQ")
        self.assertEqual(
            extract_video_id("https://youtu.be/dQw4w9WgXcQ?t=10"),
            "dQw4w9WgXcQ",
        )
        self.assertEqual(
            extract_video_id("https://youtube.com/shorts/dQw4w9WgXcQ"),
            "dQw4w9WgXcQ",
        )

    def test_rejects_non_youtube_url(self) -> None:
        with self.assertRaises(YouTubeExtractionError):
            validate_youtube_url("https://example.com/watch?v=dQw4w9WgXcQ")


class AnalysisTests(unittest.TestCase):
    def setUp(self) -> None:
        self.video = normalise_video_data(
            {
                "id": "dQw4w9WgXcQ",
                "title": "Example video",
                "channel": "Example channel",
                "view_count": 123_456,
                "comment_count": 2,
                "comments": [
                    {"text": "Great video!", "author": "A", "like_count": 8},
                    {"text": "Interesting perspective.", "author": "B"},
                ],
            },
            source_url=TEST_URL,
            max_comments=100,
        )

    def test_summary_and_final_sanity_check(self) -> None:
        summary = CommentSummarizer(
            api_key="test-key",
            model="gpt-5.4-mini",
            client=FakeOpenAIClient(),
        ).summarize(self.video)
        result = run_sanity_checks(
            VideoAnalysis(video=self.video, comment_summary=summary)
        )

        self.assertTrue(result.passed, result.errors)
        self.assertIn("view count is a non-negative integer", result.checks)
        self.assertIn("Viewers are broadly positive", summary)

    def test_rejects_missing_view_count(self) -> None:
        with self.assertRaises(YouTubeExtractionError):
            normalise_video_data(
                {
                    "id": "dQw4w9WgXcQ",
                    "title": "Example video",
                    "view_count": None,
                },
                source_url=TEST_URL,
                max_comments=10,
            )


if __name__ == "__main__":
    unittest.main()
