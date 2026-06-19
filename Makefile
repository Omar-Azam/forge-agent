.PHONY: build run run-interactive shell logs clean help test pull

# Default target
help:
	@echo "🔨 Forge Agent — Docker Commands"
	@echo ""
	@echo "  make build          Build the Docker image"
	@echo "  make run            Run a single task (TASK='your task')"
	@echo "  make interactive    Start interactive mode"
	@echo "  make shell          Open a shell in the container"
	@echo "  make logs           Show container logs"
	@echo "  make clean          Remove container and image"
	@echo "  make test           Run tests in Docker"
	@echo "  make pull           Pull latest image from registry"
	@echo ""
	@echo "Examples:"
	@echo "  make run TASK='build a REST API'"
	@echo "  make interactive"

IMAGE_NAME := forge-agent
IMAGE_TAG  := latest
FULL_IMAGE := $(IMAGE_NAME):$(IMAGE_TAG)

build:
	docker build -t $(FULL_IMAGE) .
	@echo "✓ Built $(FULL_IMAGE)"

run:
	@if [ -z "$(TASK)" ]; then \
		echo "Error: TASK not set. Usage: make run TASK='your task'"; \
		exit 1; \
	fi
	docker run --rm \
		-v "$(PWD):/workspace" \
		-v forge-agent-data:/root/.deepseek-agent \
		--network host \
		$(FULL_IMAGE) "$(TASK)"

interactive:
	docker run --rm -it \
		-v "$(PWD):/workspace" \
		-v forge-agent-data:/root/.deepseek-agent \
		--network host \
		$(FULL_IMAGE) --interactive

shell:
	docker run --rm -it \
		-v "$(PWD):/workspace" \
		-v forge-agent-data:/root/.deepseek-agent \
		--network host \
		--entrypoint /bin/bash \
		$(FULL_IMAGE)

logs:
	docker logs forge-agent 2>&1 | tail -50

clean:
	-docker stop forge-agent 2>/dev/null
	-docker rm forge-agent 2>/dev/null
	-docker rmi $(FULL_IMAGE) 2>/dev/null
	-docker volume rm forge-agent-data 2>/dev/null
	@echo "✓ Cleaned up Docker resources"

test:
	docker run --rm \
		-v "$(PWD):/app" \
		-w /app \
		node:20-slim \
		sh -c "npm ci && npm test"

pull:
	docker pull ghcr.io/omar-azam/forge-agent:latest
	docker tag ghcr.io/omar-azam/forge-agent:latest $(FULL_IMAGE)
	@echo "✓ Pulled and tagged as $(FULL_IMAGE)"
