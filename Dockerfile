FROM ubuntu:oracular
ENV VENV_PATH=/venv

RUN apt update && apt install -y npm brotli git python3.12 python3.12-venv

COPY requirements.txt requirements.txt
RUN python3 -m venv $VENV_PATH && $VENV_PATH/bin/pip install -r requirements.txt

# install gh
RUN (type -p wget >/dev/null || (apt update && apt-get install wget -y)) \
    && mkdir -p -m 755 /etc/apt/keyrings \
    && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    && cat $out | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt update \
    && apt install gh -y

# always activate the virtual environment
ENV PATH="$VENV_PATH/"bin":$PATH"