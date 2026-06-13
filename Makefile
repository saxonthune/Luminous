.PHONY: kill typecheck

kill:
	@lsof -ti :4080 -ti :5200 | xargs -r kill -9 2>/dev/null || true
	@echo "Killed processes on ports 4080 and 5200"

typecheck:
	pnpm -r typecheck
