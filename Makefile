.PHONY: backend-test frontend-lint frontend-build check

backend-test:
	cd backend && python -m pytest tests

frontend-lint:
	cd frontend && pnpm lint

frontend-build:
	cd frontend && pnpm exec next build --webpack

check: backend-test frontend-lint frontend-build
