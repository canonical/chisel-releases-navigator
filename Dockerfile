FROM ubuntu:noble

RUN apt update && apt install --yes --no-install-recommends npm && \
    apt clean && rm -rf /var/lib/apt/lists/*

RUN npm install --global yarn && npm cache clean --force

COPY ./dashboard /dashboard
WORKDIR /dashboard
RUN chown --recursive ubuntu:ubuntu /dashboard

RUN yarn install --frozen-lockfile --ignore-engines
