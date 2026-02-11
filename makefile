.DEFAULT_GOAL := help
.SUFFIXES:
SHELL := /usr/bin/bash

DOCKER_FLAGS := --rm --user ubuntu:ubuntu --publish 3000:3000 \
	--volume ./data_scraper/index.db.br:/dashboard/index.db.br

IMAGE=dev-image

.PHONY: help
help:  ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

.PHONY: build-dist
build-dist: dashboard/dist  ## Build the production distribution

data_scraper/index.db.br: data_scraper/data_scraper.py
	uv --directory data_scraper run data_scraper.py -j-1 --force --compress index.db

.PHONY: build-image
build-image: Dockerfile $(shell find dashboard/src -type f)  ## Build the development Docker image
	docker build -t $(IMAGE) -f $< .
# 	docker save $(IMAGE) > $@

.PHONY: save-image
save-image:  ## Save the development Docker image IMAGE_PATH
	if [ -z "$(IMAGE_PATH)" ]; then echo "IMAGE_PATH is not set. Please set IMAGE_PATH to save the image."; exit 1; fi
	$(MAKE) build-image;
	docker save $(IMAGE) > $(IMAGE_PATH)

# .PHONY: run-dev-image
# run-dev-image:  ## Run an interactive shell in the development image
# 	if [ -z "$(IMAGE_PATH)" ]; then $(MAKE) build-image; else docker load --input $(IMAGE_PATH); fi
# 	docker run -it $(DOCKER_FLAGS) $(IMAGE) /bin/bash

.PHONY: serve
serve:  ## Run the development server
	if [ -z "$(IMAGE_PATH)" ]; then $(MAKE) build-image; else docker load --input $(IMAGE_PATH); fi
	docker run $(DOCKER_FLAGS) $(IMAGE) webpack serve --no-client-overlay --mode production

dashboard/dist: data_scraper/index.db.br
	if [ -z "$(IMAGE_PATH)" ]; then $(MAKE) build-image; else docker load --input $(IMAGE_PATH); fi
	docker rm -f build-temp || true
	docker run $(DOCKER_FLAGS) --name build-temp $(IMAGE) sleep inf &
	sleep 2  # wait for container to start
	docker exec build-temp webpack build --mode production
	docker cp build-temp:/dashboard/dist ./dashboard/dist
	docker rm -f build-temp

.PHONY: clean
clean:  ## Clean up generated files
	rm -f data_scraper/index.db
	rm -f data_scraper/index.db.br
	rm -rf dashboard/dist
	rm -f dev-image.tar
