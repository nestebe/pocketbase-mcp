# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-14

### Added

- Initial release: a complete MCP server for PocketBase with **55 tools** covering
  collections, records (incl. transactional batch), authentication, superusers, files,
  logs, settings, backups, crons, and a `send_raw_request` escape hatch.
- Auto-authentication as a superuser from environment variables, with transparent
  token refresh.
- File upload/download between the local filesystem and PocketBase file fields.
- Local test environment under `docker-test/` (pinned PocketBase 0.39.6) and two
  end-to-end smoke-test suites.
- npm publishing with provenance, official MCP Registry metadata (`server.json`),
  Dockerfile and GitHub Actions CI/release workflows.
