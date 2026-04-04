"""CLI entrypoint for database seeding."""

from __future__ import annotations

import asyncio

from app.db.seeds.seed_data import seed_database


def main() -> None:
    """Run async seed routine."""
    asyncio.run(seed_database())
    print("Database seeding completed.")


if __name__ == "__main__":
    main()
