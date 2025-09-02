#!/bin/bash

SCRIPT_PATH="$0"
ROOT_DIR=$(dirname $SCRIPT_PATH)
cd $ROOT_DIR # change to the script directory

IMAGE_NAME=chisel_dashboard_dev
IMAGE_TAG=latest

COMMON_DOCKER_ARGS="--rm -v $ROOT_DIR/:/repo -u $(id -u):$(id -g)"

function help_msg(){
    echo "Usage: $0 <action>"
}

function build_dev_image(){
    # TODO: add a flag to force rebuild
    echo "Building development image..."
    if  ! docker inspect $IMAGE_NAME:$IMAGE_TAG &> /dev/null \
        || [ "$1" == "force" ]; then
        set -x
        docker build --load -t $IMAGE_NAME:$IMAGE_TAG .
    else
        echo "Development image already exists."
    fi
}

function save_dev_image(){
    echo "Saving the development image..."
    if [ -z "$1" ]; then
        echo "expected image archive as argument."
        exit 1
    fi
    docker save $IMAGE_NAME:$IMAGE_TAG > "$1"
}

function load_dev_image(){
    echo "Loading the development image..."
    if [ -z "$1" ]; then
        echo "expected image archive as argument."
        exit 1
    fi
    docker load < "$1"
}

function image_shell(){
    echo "Entering development image shell..."
    docker run $COMMON_DOCKER_ARGS -it -w /repo \
        $IMAGE_NAME:$IMAGE_TAG /bin/bash
}


function run_server(){
    #TODO: parametrize the port
    echo "Running the server.... Open port 3000 in your browser."
    docker run $COMMON_DOCKER_ARGS -w /repo/dashboard -p 3000:3000 \
        $IMAGE_NAME:$IMAGE_TAG webpack serve --no-client-overlay
}

function build_site(){
    echo "Building the website..."
    docker run $COMMON_DOCKER_ARGS -w /repo/dashboard \
        $IMAGE_NAME:$IMAGE_TAG webpack build
}

function update_index(){
    echo "Building the index..."
    docker run $COMMON_DOCKER_ARGS -w /repo \
        $IMAGE_NAME:$IMAGE_TAG  python3 -m data_manager compile $@
}

function update_data(){
    echo "Fetching data..."
    # TODO: is there a better way to pass the secrets? this seems
    # it could be easy to forget to add a secret here.
    # Ex. add environment variable to pass secret
    # -e GH_TOKEN="$GH_TOKEN" \
    docker run $COMMON_DOCKER_ARGS -w /repo \
        $IMAGE_NAME:$IMAGE_TAG  python3 -m data_manager fetch $@
}

function install_node_deps(){
    echo "Installing node dependencies..."
    docker run $COMMON_DOCKER_ARGS -w /repo/dashboard \
      $IMAGE_NAME:$IMAGE_TAG npx --yes yarn install
}

function setup_worktree(){
    echo "Setting up worktree..."
    git fetch --all
    git worktree add "$ROOT_DIR/dashboard/dist" dashboard
    git worktree add "$ROOT_DIR/data" data
}

function push_changes() {
    local dir="$1"
    local commit_msg="$2"

    if [ -z "$commit_msg" ]; then
        echo "Commit message is required."
        exit 1
    fi

    pushd "$dir"
        if git diff-index --quiet HEAD; then
            echo "No changes to commit"
            exit
        fi
        git add -A
        git -c user.name='Dashboard Worker' -c user.email='' \
            commit -m "$commit_msg"
        git push
    popd
}

if [ -z "$1" ]; then
    help_msg
    exit 1
fi

action="$1"
shift # capture remaining arguments
args="$@" 
case "$action" in

    # website development
    run_server)
        run_server $args
    ;;
    build_site)
        update_index $args
        build_site $args
    ;;
    update_index)
        update_index $args
    ;;
    update_data)
        update_data $args
    ;;
    install_node_deps)
        install_node_deps $args
    ;;

    # development image management
    load_image)
        load_dev_image $args
        ;;
    save_image)
        build_dev_image $args
        save_dev_image $args
        ;;
    setup)
        build_dev_image $args
        setup_worktree $args
        ;;
    rebuild_image)
        build_dev_image force
        ;;
    image_shell)
        image_shell $args
        ;;
    push_data)
        push_changes data "$args"
    ;;
    push_dist)
        mv index.db dashboard/dist/index.db
        push_changes dashboard/dist "$args"
    ;;
    *)
        help_msg $args
        exit 1
        ;;
esac
